import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { load } from './db.js'
import authRoutes from './routes/auth.js'
import offresRoutes from './routes/offres.js'
import reservationsRoutes from './routes/reservations.js'
import metaRoutes from './routes/meta.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

load()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'SkillSwap Campus' }))
app.use('/api/auth', authRoutes)
app.use('/api', offresRoutes)
app.use('/api', reservationsRoutes)
app.use('/api', metaRoutes)

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }))

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')))
} else {
  app.get('/', (req, res) =>
    res
      .status(200)
      .send('API SkillSwap Campus en ligne. Lancez `npm run build` pour servir l interface sur cette adresse.'),
  )
}

app.use((err, req, res, next) => {
  console.error('[api] erreur:', err)
  res.status(500).json({ error: 'Erreur interne du serveur.' })
})

app.listen(PORT, () => {
  console.log(`SkillSwap Campus API sur http://localhost:${PORT}`)
})
