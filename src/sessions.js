// src/sessions.js - Gestión de sesiones en Supabase
const supabase = require('./database');

class SessionManager {
  // Obtener sesión
  static async getSession(telegramId) {
    try {
      const { data, error } = await supabase
        .from('bot_sessions')
        .select('session_data')
        .eq('telegram_id', telegramId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error obteniendo sesión:', error);
        return {};
      }
      
      return data ? data.session_data : {};
    } catch (error) {
      console.error('Error en getSession:', error);
      return {};
    }
  }
  
  // Guardar sesión
  static async saveSession(telegramId, sessionData) {
    try {
      const { error } = await supabase
        .from('bot_sessions')
        .upsert({
          telegram_id: telegramId,
          session_data: sessionData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'telegram_id'
        });
      
      if (error) {
        console.error('Error guardando sesión:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error en saveSession:', error);
      return false;
    }
  }
  
  // Limpiar sesión
  static async clearSession(telegramId) {
    try {
      await supabase
        .from('bot_sessions')
        .delete()
        .eq('telegram_id', telegramId);
      
      return true;
    } catch (error) {
      console.error('Error limpiando sesión:', error);
      return false;
    }
  }
}

module.exports = SessionManager;
