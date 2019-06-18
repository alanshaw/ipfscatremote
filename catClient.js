const Ipfs = require('ipfs')
const Fs = require('fs').promises
const Os = require('os')
const Path = require('path')
const pull = require('pull-stream')
const { promisify } = require('util')
const { PROTOCOL, HASBOT, JOYPORT } = require('./constants')
const Inquirer = require('inquirer')
const keypress = require('keypress')
const pushable = require('pull-pushable')

const { EventBus } = require('light-event-bus')
const dbg = require('debug')('ipfsCat:catClient')

const five = require('johnny-five')
const miniBus = new EventBus()

const REPO_DIR = Path.join(Os.homedir(), '.ipfs-catremote-client')

async function main (options) {
  options = options || {}

  console.log('🐈📱 CLIENT starting...')

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

  while (true) {
    const { addr } = await Inquirer.prompt([{
      type: 'input',
      name: 'addr',
      message: 'Connect to remote:'
    }])

    let conn
    try {
      conn = await promisify(libp2p.dialProtocol.bind(libp2p))(addr, PROTOCOL)
      console.log(`Successfully dialed ${addr}!`)
    } catch (err) {
      console.error(`Failed to dial ${addr}`, err)
      continue
    }

    console.log('(Use the arrow keys to control the lazer, hit "q" to quit)')
    try {
      await new Promise((resolve, reject) => {
        keypress(process.stdin)

        const pusher = pushable()
        const onKeypress = (ch, key) => {
          console.log(`Sending: ${key.name}`)
          pusher.push(Buffer.from(JSON.stringify(key)))
          if (key.name === 'q') pusher.end()
        }
        miniBus.subscribe('pos', async arg => {
          pusher.push(Buffer.from(JSON.stringify(arg)))
        })
        process.stdin.on('keypress', onKeypress)
        process.stdin.setRawMode(true)
        process.stdin.resume()

        pull(
          pusher,
          conn,
          pull.through(msg => console.log(`Message from server: ${msg}`)),
          pull.onEnd(err => {
            process.stdin.off('keypress', onKeypress)
            if (err) return reject(err)
            resolve()
          })
        )
      })
      console.log('🐈📱 session finished')
    } catch (err) {
      console.error('🐈📱 connection errored', err)
    }
  }
}

function makeBot () {
  const board = new five.Board({ port: JOYPORT })

  board.on('ready', function () {
    console.log('board is ready')

    // Create a new `joystick` hardware instance.
    var joystick = new five.Joystick({
    //   [ x, y ]
      pins: ['A0', 'A1']
    })

    // main()

    joystick.on('change', async function () {
    // console.log('Joystick');
    // console.log('  x : ', this.x);
    // console.log('  y : ', this.y);
      const { x, y } = this
      // console.log('--------------------------------------');
      if (x > 0.1 || y > 0.1 || x < -0.1 || y < -0.1) {
        dbg(x, y)
        miniBus.publish('pos', [x, y])
      }
    })
  })
  return board
}

main()

if (HASBOT) makeBot()
