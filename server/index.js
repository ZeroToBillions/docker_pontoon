// index.js
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import dotenv from 'dotenv'
import routes from './routes.js'
// import playersRoutes from './routes.players.js'

dotenv.config()
const app = express()
app.use(cors())
app.use(bodyParser.json())

app.use('/api', routes)
// app.use('/api', playersRoutes)

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`Server listening on ${port}`))