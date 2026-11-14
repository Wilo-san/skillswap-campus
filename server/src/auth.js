import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { get, publicUser } from './db.js'

const SECRET = process.env.JWT_SECRET || 'skillswap-campus-dev-secret-change-me'

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash)
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '7d' })
}

export function userFromRequest(req) {
  const header = req.headers.authorization || ''
  const [, token] = header.split(' ')
  if (!token) return null
  try {
    const payload = jwt.verify(token, SECRET)
    return get().users.find((u) => u.id === payload.sub) || null
  } catch {
    return null
  }
}

export function requireAuth(req, res, next) {
  const user = userFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Authentification requise.' })
  if ((user.statut || 'actif') !== 'actif') {
    return res.status(403).json({ error: 'Ce compte est desactive.' })
  }
  req.user = user
  req.me = publicUser(user)
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Action reservee aux administrateurs.' })
  }
  next()
}
