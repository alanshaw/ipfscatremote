const Ipfs = require('ipfs')
const Fs = require('fs').promises
const Os = require('os')
const Path = require('path')
const pull = require('pull-stream')
const { promisify } = require('util')
const pushable = require('pull-pushable')
const { PROTOCOL, HASBOT, CATPORT } = require('./constants')

const { EventBus } = require('light-event-bus')
const dbg = require('debug')('ipfsCat:server')
const n = require('normie')

const five = require('johnny-five')
const miniBus = new EventBus()

const REPO_DIR = Path.join(Os.homedir(), '.ipfs-catremote-server')

async function main (options) {
  options = options || {}

  console.log('🐈📱 SERVER starting... yya')

  await Fs.mkdir(REPO_DIR, { recursive: true })

  const ipfs = new Ipfs({
    config: {
      Addresses: {
        Swarm: [
          '/ip4/0.0.0.0/tcp/0',
          '/ip4/127.0.0.1/tcp/0/ws'
        ],
        API: '/ip4/127.0.0.1/tcp/0',
        Gateway: '/ip4/127.0.0.1/tcp/0'
      }
    },
    repo: REPO_DIR
  })

  await new Promise((resolve, reject) => {
    ipfs.on('ready', resolve).on('error', reject)
  })

  console.log('IPFS is ready')
  const { libp2p } = ipfs
  let handler = null
  let coords = { x: 0, y: 0 } // The current servo coordinates

  console.log(`Setting up handler for 🐈📱 protocol ${PROTOCOL}`)

  libp2p.handle(PROTOCOL, async (_, conn) => {
    const connectingPeer = await promisify(conn.getPeerInfo.bind(conn))()

    if (handler) {
      console.log(`Ignoring incoming connection from ${connectingPeer.id.toB58String()}, already handled by ${handler.id.toB58String()}`)
      return pull(pull.error(new Error('Already handled')), conn)
    }

    handler = connectingPeer
    console.log(`New handler ${handler.id.toB58String()}`)

    const pusher = pushable()
    pusher.push(Buffer.from('🐈📱 ready'))

    pull(
      pusher,
      conn,
      pull.through(msg => {
        const key = JSON.parse(msg)

        let nextCoords

        switch (key.name) {
          case 'up':
            nextCoords = { ...coords, y: Math.min(coords.y + 1, 180) }
            break
          case 'down':
            nextCoords = { ...coords, y: Math.max(coords.y - 1, 0) }
            break
          case 'left':
            nextCoords = { ...coords, x: Math.max(coords.x - 1, 0) }
            break
          case 'right':
            nextCoords = { ...coords, x: Math.min(coords.x + 1, 180) }
            break
          case 'q':
            console.log('Got quit command from remote, closing connection')
            return pusher.end()
          default:
            nextCoords = { ...coords, x: coords.x + key[0], y: coords.y + key[1] }
        }

        if (!nextCoords) return

        coords = nextCoords
        // console.log(coords)
        // TODO: move servos to coords.x and coords.y
        miniBus.publish('pos', coords)
      }),
      pull.onEnd(err => {
        if (err) return console.log(`Connection to ${handler.id.toB58String()} closed with error ${err}`)
        console.log(`Connection to ${handler.id.toB58String()} closed`)
        handler = null
        console.log('⏳ Waiting for connections...')
      })
    )
  })

  console.log('⏳ Waiting for connections...')
}

function makeBot () {
  // const board = new five.Board()
  const board = new five.Board({ port: CATPORT })

  board.on('ready', function () {
    var servoX = new five.Servo(10)
    var servoY = new five.Servo(11)
    servoX.to(botX)
    servoY.to(botY)
    miniBus.subscribe('pos', pos => {
      console.log('bot get', pos.x, pos.y)
      servoX.to(pos.x)
      servoY.to(pos.y)
    })
  })
}
const botX = 90
const botY = 90

main()
if (HASBOT) makeBot()
