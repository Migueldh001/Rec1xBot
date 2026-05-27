// index.js - Bot de Telegram para 1xBet Recargas
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const supabase = require('./src/database');
const SessionManager = require('./src/sessions');

// Inicializar bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// IDs de administradores
let ADMIN_IDS = [];

console.log('🤖 Bot iniciando...');

// Middleware para cargar/guardar sesiones desde Supabase
bot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id;
    
    if (telegramId) {
        // Cargar sesión desde Supabase
        ctx.session = await SessionManager.getSession(telegramId);
        console.log(`📋 Sesión cargada para ${telegramId}:`, ctx.session);
    }
    
    await next();
    
    // Guardar sesión después de procesar
    if (telegramId && ctx.session) {
        await SessionManager.saveSession(telegramId, ctx.session);
        console.log(`💾 Sesión guardada para ${telegramId}`);
    }
});

// Función para cargar admins
async function cargarAdmins() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('telegram_id')
            .eq('is_admin', true)
            .not('telegram_id', 'is', null);
        
        if (data && data.length > 0) {
            ADMIN_IDS = data.map(user => user.telegram_id);
            console.log('✅ Admins desde BD:', ADMIN_IDS);
        } else {
            console.log('⚠️ No hay admins en BD');
            ADMIN_IDS = [];
        }
        
        const envAdmin = parseInt(process.env.ADMIN_ID);
        if (!ADMIN_IDS.includes(envAdmin)) {
            ADMIN_IDS.push(envAdmin);
        }
        
        console.log('👑 ADMIN_IDS:', ADMIN_IDS);
    } catch (error) {
        console.error('Error cargando admins:', error);
        ADMIN_IDS = [parseInt(process.env.ADMIN_ID)];
    }
}

function esAdmin(ctx) {
    return ADMIN_IDS.includes(ctx.from.id);
}

// Comando /start
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    
    console.log(`\n=== /START de ${username} (${userId}) ===`);
    
    // Limpiar sesión
    ctx.session = {};
    
    try {
        const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', userId)
            .single();
        
        console.log('Usuario en BD:', userData ? '✅ Encontrado' : '❌ No encontrado');
        
        if (userData) {
            console.log('  bet_id:', userData.bet_id);
            console.log('  is_admin:', userData.is_admin);
            
            if (userData.is_admin) {
                await mostrarMenuAdmin(ctx);
            } else {
                await mostrarMenuUsuario(ctx);
            }
        } else {
            await mostrarBienvenida(ctx);
        }
    } catch (error) {
        console.error('Error en /start:', error);
        await ctx.reply('❌ Error al iniciar.');
    }
});

async function mostrarBienvenida(ctx) {
    await ctx.reply(
        '¡Hola! 👋\n\n' +
        'Bienvenido al sistema de recargas de *1xBet*.\n\n' +
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

async function mostrarMenuUsuario(ctx) {
    await ctx.reply(
        '📱 *Menú Principal*\n\nSelecciona una opción:',
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([
                ['💳 Nueva Recarga'],
                ['💲 Estado Actual', '📋 Mis Recargas'],
                ['📞 Contactar Soporte', '⚙️ Configuración']
            ]).resize()
        }
    );
}

async function mostrarMenuAdmin(ctx) {
    const { count } = await supabase
        .from('recharges')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
    
    await ctx.reply(
        '⚙️ *Panel Administrativo*\n\nBienvenido, Admin.',
        {
            parse_mode: 'Markdown',
            ...Markup.keyboard([
                [`📥 Solicitudes (${count || 0})`],
                ['👥 Usuarios', '💱 Configurar Tasa'],
                ['📊 Estadísticas', '📞 Configurar Contacto'],
                ['➕ Agregar Admin', '👤 Ver como Usuario']
            ]).resize()
        }
    );
}

// Callbacks
bot.action('tiene_cuenta', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '✅ Perfecto.\n\n¿Ya estás registrado en este bot?',
        Markup.inlineKeyboard([
            [Markup.button.callback('✅ Sí, estoy registrado', 'ya_registrado')],
            [Markup.button.callback('📝 No, registrarme', 'iniciar_registro')]
        ])
    );
});

bot.action('crear_cuenta', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '🌐 Visita:\nhttps://1xbet.com\n\nLuego vuelve y usa /start',
        Markup.inlineKeyboard([
            [Markup.button.url('🌐 Ir a 1xBet', 'https://1xbet.com')],
            [Markup.button.callback('✅ Ya tengo cuenta', 'tiene_cuenta')]
        ])
    );
});

bot.action('ya_registrado', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.esperando = 'login_bet_id';
    await ctx.reply('🔐 *Iniciar Sesión*\n\nEnvía tu ID de 1xBet:', { parse_mode: 'Markdown' });
});

bot.action('iniciar_registro', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.esperando = 'bet_id';
    await ctx.reply(
        '📝 *Registro*\n\nEnvía tu ID de 1xBet:',
        { parse_mode: 'Markdown' }
    );
});

bot.action('volver_inicio', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    await mostrarBienvenida(ctx);
});

// Manejador de texto
bot.on('text', async (ctx) => {
    const texto = ctx.message.text.trim();
    
    console.log(`\n📝 Mensaje: "${texto}"`);
    console.log(`📋 Estado: ${ctx.session.esperando || 'ninguno'}`);
    
    if (texto.startsWith('/')) return;
    
    const botones = ['💳', '📋', '📞', '⚙️', '💲', '👥', '📊', '💱', '➕', '👤', '📥'];
    if (botones.some(b => texto.includes(b))) return;
    
    if (!ctx.session.esperando) {
        await ctx.reply('Usa /start para comenzar.');
        return;
    }
    
    try {
        // LOGIN
        if (ctx.session.esperando === 'login_bet_id') {
            console.log('🔐 Buscando usuario:', texto);
            
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('bet_id', texto)
                .single();
            
            if (!data || error) {
                await ctx.reply(
                    '❌ ID no encontrado.',
                    Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver', 'volver_inicio')]])
                );
                return;
            }
            
            console.log('✅ Usuario encontrado');
            ctx.session.esperando = 'login_password';
            ctx.session.user_data = data;
            
            await ctx.reply('✅ ID correcto.\n\n🔒 Envía tu contraseña:');
        }
        else if (ctx.session.esperando === 'login_password') {
            console.log('🔐 Verificando contraseña');
            
            const passwordOk = texto === 'Recarga1xbet';
            
            if (!passwordOk) {
                await ctx.reply('❌ Contraseña incorrecta.\n\nIntenta de nuevo:');
                return;
            }
            
            const userData = ctx.session.user_data;
            
            await supabase
                .from('users')
                .update({ telegram_id: ctx.from.id })
                .eq('id', userData.id);
            
            await cargarAdmins();
            
            ctx.session = {};
            
            await ctx.reply('✅ Sesión iniciada');
            
            if (userData.is_admin) {
                await mostrarMenuAdmin(ctx);
            } else {
                await mostrarMenuUsuario(ctx);
            }
        }
        // REGISTRO
        else if (ctx.session.esperando === 'bet_id') {
            ctx.session.bet_id = texto;
            ctx.session.esperando = 'phone';
            await ctx.reply('✅ ID guardado.\n\n📱 Envía tu teléfono (+53XXXXXXXX):');
        }
        else if (ctx.session.esperando === 'phone') {
            if (!texto.startsWith('+53')) {
                await ctx.reply('⚠️ Debe empezar con +53');
                return;
            }
            
            ctx.session.phone = texto;
            ctx.session.esperando = 'password';
            await ctx.reply('✅ Teléfono guardado.\n\n🔒 Crea una contraseña (mín. 6 caracteres):');
        }
        else if (ctx.session.esperando === 'password') {
            if (texto.length < 6) {
                await ctx.reply('⚠️ Mínimo 6 caracteres.');
                return;
            }
            
            ctx.session.password = texto;
            ctx.session.esperando = 'confirm_password';
            await ctx.reply('🔒 Repite la contraseña:');
        }
        else if (ctx.session.esperando === 'confirm_password') {
            if (texto !== ctx.session.password) {
                await ctx.reply('❌ No coinciden.\n\nEnvía la contraseña de nuevo:');
                ctx.session.esperando = 'password';
                return;
            }
            
            const { data, error } = await supabase
                .from('users')
                .insert([{
                    bet_id: ctx.session.bet_id,
                    phone: ctx.session.phone,
                    telegram_id: ctx.from.id,
                    is_admin: false
                }])
                .select()
                .single();
            
            if (error) {
                console.error('Error registro:', error);
                await ctx.reply('❌ Error. Intenta más tarde.');
                return;
            }
            
            ctx.session = {};
            await ctx.reply('✅ ¡Registro exitoso!');
            await mostrarMenuUsuario(ctx);
        }
    } catch (error) {
        console.error('Error:', error);
        await ctx.reply('❌ Error. Usa /start');
        ctx.session = {};
    }
});

// Botones menú
bot.hears(/💳|💲|📋|📞|⚙️/, (ctx) => ctx.reply('Función en desarrollo...'));
bot.hears(/📥|👥|💱|📊|➕/, async (ctx) => {
    if (!esAdmin(ctx)) return;
    await ctx.reply('Función admin en desarrollo...');
});

bot.hears('👤 Ver como Usuario', async (ctx) => {
    if (!esAdmin(ctx)) return;
    await mostrarMenuUsuario(ctx);
});

bot.catch((err) => console.error('Error bot:', err));

async function iniciarBot() {
    try {
        await cargarAdmins();
        await bot.launch();
        console.log('✅ Bot iniciado');
        
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

iniciarBot();
