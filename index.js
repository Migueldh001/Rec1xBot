// index.js - Bot de Telegram para 1xBet Recargas
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const supabase = require('./src/database');

// Inicializar bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// IDs de administradores (inicialmente solo tú)
let ADMIN_IDS = [parseInt(process.env.ADMIN_ID)];

console.log('🤖 Bot iniciando...');
console.log('📋 Admin ID:', process.env.ADMIN_ID);

// Función para cargar admins desde la BD
async function cargarAdmins() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq('is_admin', true);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            ADMIN_IDS = data.map(user => {
                // Convertir UUID a Telegram ID (necesitamos mapeo)
                // Por ahora solo usamos el ID de .env
                return parseInt(process.env.ADMIN_ID);
            });
        }
        
        console.log('✅ Admins cargados:', ADMIN_IDS);
    } catch (error) {
        console.error('❌ Error cargando admins:', error.message);
    }
}

// Middleware para verificar si es admin
function esAdmin(ctx) {
    return ADMIN_IDS.includes(ctx.from.id);
}

// Comando /start
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    
    console.log(`👤 Usuario ${username} (${userId}) ejecutó /start`);
    
    try {
        // Verificar si el usuario existe en la BD
        const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        if (userData) {
            // Usuario ya registrado
            if (userData.is_admin || esAdmin(ctx)) {
                await mostrarMenuAdmin(ctx);
            } else {
                await mostrarMenuUsuario(ctx);
            }
        } else {
            // Usuario nuevo - Mostrar bienvenida
            await mostrarBienvenida(ctx);
        }
    } catch (error) {
        console.error('❌ Error en /start:', error);
        await ctx.reply('❌ Error al iniciar. Por favor intenta de nuevo.');
    }
});

// Función: Mostrar bienvenida
async function mostrarBienvenida(ctx) {
    await ctx.reply(
        '¡Hola! 👋\n\n' +
        'Bienvenido al sistema de recargas de *1xBet*.\n\n' +
        'Para usar este bot necesitas tener una cuenta en 1xBet.\n\n' +
        '¿Ya tienes cuenta en 1xBet?',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Sí, tengo cuenta', 'tiene_cuenta')],
                [Markup.button.callback('❌ No, crear cuenta', 'crear_cuenta')]
            ])
        }
    );
}

// Función: Mostrar menú de usuario
async function mostrarMenuUsuario(ctx) {
    const teclado = Markup.keyboard([
        ['💳 Nueva Recarga'],
        ['💲 Estado Actual', '📋 Mis Recargas'],
        ['📞 Contactar Soporte', '⚙️ Configuración']
    ]).resize();
    
    await ctx.reply(
        '📱 *Menú Principal*\n\n' +
        'Selecciona una opción:',
        {
            parse_mode: 'Markdown',
            ...teclado
        }
    );
}

// Función: Mostrar menú de admin
async function mostrarMenuAdmin(ctx) {
    // Contar solicitudes pendientes
    const { count } = await supabase
        .from('recharges')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
    
    const solicitudesPendientes = count || 0;
    
    const teclado = Markup.keyboard([
        [`📥 Solicitudes (${solicitudesPendientes})`],
        ['👥 Usuarios', '💱 Configurar Tasa'],
        ['📊 Estadísticas', '📞 Configurar Contacto'],
        ['➕ Agregar Admin', '👤 Ver como Usuario']
    ]).resize();
    
    await ctx.reply(
        '⚙️ *Panel Administrativo*\n\n' +
        'Bienvenido, Admin.\n' +
        'Selecciona una opción:',
        {
            parse_mode: 'Markdown',
            ...teclado
        }
    );
}

// Callback: Usuario tiene cuenta
bot.action('tiene_cuenta', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '✅ Perfecto.\n\n' +
        '¿Ya estás registrado en este bot?',
        Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sí, estoy registrado', 'ya_registrado')],
            [Markup.button.callback('📝 No, registrarme ahora', 'iniciar_registro')]
        ])
    );
});

// Callback: Usuario NO tiene cuenta
bot.action('crear_cuenta', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '🌐 Para crear tu cuenta en 1xBet, visita:\n\n' +
        'https://1xbet.com\n\n' +
        'Una vez tengas tu cuenta, vuelve aquí y presiona /start',
        Markup.inlineKeyboard([
            [Markup.button.url('🌐 Ir a 1xBet', 'https://1xbet.com')],
            [Markup.button.callback('✅ Ya tengo cuenta', 'tiene_cuenta')]
        ])
    );
});

// Callback: Ya registrado (login)
bot.action('ya_registrado', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '🔐 Función de login en desarrollo.\n\n' +
        'Por ahora, usa el menú principal.',
        Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Volver', 'volver_inicio')]
        ])
    );
});

// Callback: Iniciar registro
bot.action('iniciar_registro', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '📝 *Proceso de Registro*\n\n' +
        'Por favor, envía tu *ID de 1xBet*\n\n' +
        '_(Ejemplo: 123456789)_',
        { parse_mode: 'Markdown' }
    );
    
    // Guardar estado para el próximo mensaje
    ctx.session = { esperando: 'bet_id' };
});

// Callback: Volver al inicio
bot.action('volver_inicio', async (ctx) => {
    await ctx.answerCbQuery();
    await mostrarBienvenida(ctx);
});

// Manejadores de botones del menú
bot.hears('💳 Nueva Recarga', async (ctx) => {
    await ctx.reply('💳 Función en desarrollo...');
});

bot.hears('💲 Estado Actual', async (ctx) => {
    await ctx.reply('💲 Función en desarrollo...');
});

bot.hears('📋 Mis Recargas', async (ctx) => {
    await ctx.reply('📋 Función en desarrollo...');
});

bot.hears('📞 Contactar Soporte', async (ctx) => {
    await ctx.reply('📞 Función en desarrollo...');
});

bot.hears('⚙️ Configuración', async (ctx) => {
    await ctx.reply('⚙️ Función en desarrollo...');
});

// Manejadores de botones admin
bot.hears(/📥 Solicitudes/, async (ctx) => {
    if (!esAdmin(ctx)) return;
    await ctx.reply('📥 Función en desarrollo...');
});

bot.hears('👥 Usuarios', async (ctx) => {
    if (!esAdmin(ctx)) return;
    await ctx.reply('👥 Función en desarrollo...');
});

bot.hears('💱 Configurar Tasa', async (ctx) => {
    if (!esAdmin(ctx)) return;
    await ctx.reply('💱 Función en desarrollo...');
});

bot.hears('📊 Estadísticas', async (ctx) => {
    if (!esAdmin(ctx)) return;
    await ctx.reply('📊 Función en desarrollo...');
});

bot.hears('📞 Configurar Contacto', async (ctx) => {
    if (!esAdmin(ctx)) return;
    await ctx.reply('📞 Función en desarrollo...');
});

bot.hears('➕ Agregar Admin', async (ctx) => {
    if (!esAdmin(ctx)) return;
    await ctx.reply('➕ Función en desarrollo...');
});

bot.hears('👤 Ver como Usuario', async (ctx) => {
    if (!esAdmin(ctx)) return;
    await mostrarMenuUsuario(ctx);
});

// Error handler
bot.catch((err, ctx) => {
    console.error('❌ Error en el bot:', err);
    ctx.reply('❌ Ocurrió un error. Por favor intenta de nuevo.');
});

// Iniciar bot
async function iniciarBot() {
    try {
        await cargarAdmins();
        
        await bot.launch();
        console.log('✅ Bot iniciado correctamente');
        console.log('🔗 Bot: @' + (await bot.telegram.getMe()).username);
        
        // Graceful stop
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (error) {
        console.error('❌ Error al iniciar bot:', error);
        process.exit(1);
    }
}

iniciarBot();