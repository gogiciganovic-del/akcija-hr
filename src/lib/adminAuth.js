const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'akcije2025'

export function isAdminLoggedIn() {
  return sessionStorage.getItem('admin_auth') === 'true'
}

export function adminLogin(password) {
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem('admin_auth', 'true')
    return true
  }
  return false
}

export function adminLogout() {
  sessionStorage.removeItem('admin_auth')
}
