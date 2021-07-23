const express = require('express')
const fs = require('fs')
const mqtt = require('mqtt')
const dotenv = require('dotenv').config()
var cors = require('cors')

const app = express()
app.use(cors())

const TOPIC = 'home/master/temp_humi'

app.use(express.static('./static/'))

// Serve a default HTML page to the client
app.get('/', (req, resp) => {
  resp.send(fs.readFileSync('./static/index.html'))
})

// Endpoint for server-sent events
app.get('/stream', (req, resp) => {
  const client = mqtt.connect(process.env.MQTT_BROKER_URL, {
    username: process.env.MQTT_BROKER_USERNAME,
    password: process.env.MQTT_BROKER_PASSWORD,
  })

  client.on('connect', function () {
    client.subscribe(TOPIC, function (err) {
      if (err) {
        console.log('Error subscribing to topic. Exiting.')
        resp.send(500, 'Trouble connecting to the broker!')
      }
    })
  })

  resp.set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
  })
  resp.flushHeaders()
  resp.write('retry: 5000\n\n')

  client.on('message', (topic, message) => {
    console.log('[INFO] Received data')
    let payload = message.toString()
    resp.write(`data: ${payload} \n\n`)
  })

  // When client disconnects, log & unsubscribe from any listeners
  resp.on('close', () => {
    console.log('No longer streaming to client.')
    client.unsubscribe(TOPIC, () => {
      console.log('Unsubscribed from broker!')
    })
  })
})

app.listen(3000, () => {
  console.log('Server running on port 3000.\nCall /stream for SSE feed.\n\n')
})
