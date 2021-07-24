const express = require('express')
const fs = require('fs')
const mqtt = require('mqtt')
const dotenv = require('dotenv').config()
var cors = require('cors')
const sqlite3 = require('sqlite3').verbose()
const XLSX = require('xlsx')

const app = express()
app.use(cors())

const PORT = Number(process.env.PORT) || 5000
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
    // TODO: Handle errors if sensor doesn't send expected message
    let response = JSON.parse(message.toString())
    const deviceId = response.deviceId
    const sensors = response.data

    let payload = null

    for (let idx = 0; idx < sensors.length; idx++) {
      let sensor = sensors[idx]
      if (sensor.type == 'temp') {
        sensor.sensorId = `${deviceId}-${sensor.sensorId}`
        payload = JSON.stringify(sensor)
        break
      }
    }
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

app.get('/download', (req, resp) => {
  let db = new sqlite3.Database('sensor.db', (err) => {
    if (err) {
      resp.sendStatus(400)
      return
    }
  })

  const sql = 'SELECT * FROM readings;' // Add WHERE based on sensorId later

  db.all(sql, [], (err, rows) => {
    if (err) resp.send(err.message)
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports by Teknowish')
    const FILENAME = `TW-Report.xlsx`

    // Write temporary file to disk for downloading
    XLSX.writeFile(workbook, FILENAME)

    // Send file for download & delete when sent
    resp.download(FILENAME, (e) => {
      fs.unlink(FILENAME, (e) => {})
    })
  })

  db.close((e) => {})
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}.\nCall /stream for SSE feed.\n\n`)
})
