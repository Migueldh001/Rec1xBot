// index.js - Bot de Telegram para 1xBet Recargas
require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const supabase = require('./src/database');

// Inicializar sesión local
const localSession = new LocalSession({
    database: 'sessions.json',
    storage: LocalSession.storageMemory
});

// Inicializar bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Usar middleware de sesión
bot.use(localSession.middleware());

// IDs de administradores
let ADMIN_IDS = [];

console.log('🤖 Bot iniciando...');
console.log('📋 Admin ID (env):', process.env.ADMIN_ID);

// Función para cargar admins desde la BD
async function cargarAdmins() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('telegram_id')
            .eq('is_admin', true)
            .not('telegram_id', 'is', null);
        
        if (error) {
            console.log('⚠️ Error cargando admins de BD:', error.message);
        }
        
        if (data && data.length > 0) {
            ADMIN_IDS = data.map(user => user.telegram_id);
            console.log('✅ Admins cargados desde BD:', ADMIN_IDS);
        } else {
            console.log('⚠️ No hay admins en BD con telegram_id');
            ADMIN_IDS = [];
        }
        
        // Siempre incluir el del .env como fallback
        const envAdmin = parseInt(process.env.ADMIN_ID);
        if (!ADMIN_IDS.includes(envAdmin)) {
            ADMIN_IDS.push(envAdmin);
            console.log('✅ Admin del .env agregado:', envAdmin);
        }
        
        console.log('👑 ADMIN_IDS final:', ADMIN_IDS);
    } catch (error) {
        console.error('❌ Error cargando admins:', error.message);
        ADMIN_IDS = [parseInt(process.env.ADMIN_ID)];
    }
}

// Middleware para verificar si es admin
function esAdmin(ctx) {
    const esAdminResult = ADMIN_IDS.includes(ctx.from.id);
    console.log(`🔍 User ${ctx.from.id} - ¿Es admin?: ${esAdminResult}`);
    return esAdminResult;
}

// Comando /start
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    
    console.log(`\n👤 ${username} (${userId}) ejecutó /start`);
    
    // Limpiar sesión
    ctx.session = {};
    
    try {
        // Verificar en BD por telegram_id
        const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', userId)
            .single();
        
        console.log('📊 Usuario en BD:', userData ? 'Encontrado' : 'No encontrado');
        if (userData) {
            console.log('   - bet_id:', userData.bet_id);
            console.log('   - is_admin:', userData.is_admin);
            console.log('   - telegram_id:', userData.telegram_id);
        }
        
        if (error && error.code !== 'PGRST116') {
            console.error('❌ Error BD:', error);
        }
        
        if (userData) {
            // Usuario registrado
            if (userData.is_admin) {
                console.log('👑 Mostrando menú ADMIN');
                await mostrarMenuAdmin(ctx);
            } else {
                console.log('👤 Mostrando menú USUARIO');
                await mostrarMenuUsuario(ctx);
            }
        } else {
            // Usuario nuevo
            console.log('🆕 Mostrando bienvenida');
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

// Función: Iniciar sesión
async function iniciarSesion(ctx) {
    await ctx.reply(
        '🔐 *Iniciar Sesión*\n\n' +
        'Por favor, envía tu ID de 1xBet',
        { parse_mode: 'Markdown' }
    );
    
    ctx.session.esperando = 'login_bet_id';
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
    await iniciarSesion(ctx);
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
    
    ctx.session.esperando = 'bet_id';
});

// Callback: Volver al inicio
bot.action('volver_inicio', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session = {};
    await mostrarBienvenida(ctx);
});

// Manejador de mensajes de texto
bot.on('text', async (ctx) => {
    const texto = ctx.message.text.trim();
    
    console.log(`📝 Mensaje recibido: "${texto}"`);
    console.log(`📋 Sesión actual:`, ctx.session);
    
    // Ignorar comandos
    if (texto.startsWith('/')) return;
    
    // Ignorar botones del menú
    const botones = ['💳', '📋', '📞', '⚙️', '💲', '👥', '📊', '💱', '➕', '👤', '📥'];
    if (botones.some(b => texto.includes(b))) {
        return;
    }
    
    // Verificar sesión
    if (!ctx.session || !ctx.session.esperando) {
        await ctx.reply('Por favor usa /start para comenzar.');
        return;
    }
    
    try {
        // === FLUJO DE LOGIN ===
        if (ctx.session.esperando === 'login_bet_id') {
            console.log('🔐 Login - ID recibido:', texto);
            
            const { data: userData, error } = await supabase
                .from('users')
                .select('*')
                .eq('bet_id', texto)
                .single();
            
            if (error || !userData) {
                await ctx.reply(
                    '❌ ID no encontrado.\n\n' +
                    'Verifica tu ID de 1xBet o regístrate.',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Volver', 'volver_inicio')]
                    ])
                );
                ctx.session = {};
                return;
            }
            
            ctx.session.esperando = 'login_password';
            ctx.session.user_data = userData;
            
            await ctx.reply('✅ ID encontrado.\n\n🔒 Ahora envía tu contraseña:');
        }
        else if (ctx.session.esperando === 'login_password') {
            console.log('🔐 Login - Verificando contraseña');
            
            const userData = ctx.session.user_data;
            const passwordCorrecta = texto === 'Recarga1xbet';
            
            if (!passwordCorrecta) {
                await ctx.reply(
                    '❌ Contraseña incorrecta.\n\nIntenta de nuevo:',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🔙 Volver', 'volver_inicio')]
                    ])
                );
                return;
            }
            
            // Actualizar telegram_id
            await supabase
                .from('users')
                .update({ telegram_id: ctx.from.id })
                .eq('id', userData.id);
            
            // Recargar admins
            await cargarAdmins();
            
            ctx.session = {};
            
            await ctx.reply('✅ Inicio de sesión exitoso');
            
            if (userData.is_admin) {
                await mostrarMenuAdmin(ctx);
            } else {
                await mostrarMenuUsuario(ctx);
            }
        }
        // === FLUJO DE REGISTRO ===
        else if (ctx.session.esperando === 'bet_id') {
            console.log('📝 Registro - ID recibido:', texto);
            
            ctx.session.bet_id = texto;
            ctx.session.esperando = 'phone';
            
            await ctx.reply(
                '✅ ID guardado.\n\n' +
                '📱 Ahora envía tu número de teléfono\n' +
                '_(Formato: +53XXXXXXXX)_',
                { parse_mode: 'Markdown' }
            );
        }
        else if (ctx.session.esperando === 'phone') {
            console.log('📝 Registro - Teléfono recibido:', texto);
            
            if (!texto.startsWith('+53')) {
                await ctx.reply('⚠️ El número debe comenzar con +53\n\nIntenta de nuevo:');
                return;
            }
            
            ctx.session.phone = texto;
            ctx.session.esperando = 'password';
            
            await ctx.reply(
                '✅ Teléfono guardado.\n\n' +
                '🔒 Crea una contraseña\n' +
                '_(Mínimo 6 caracteres)_',
                { parse_mode: 'Markdown' }
            );
        }
        else if (ctx.session.esperando === 'password') {
            if (texto.length < 6) {
                await ctx.reply('⚠️ La contraseña debe tener al menos 6 caracteres.\n\nIntenta de nuevo:');
                return;
            }
            
            ctx.session.password = texto;
            ctx.session.esperando = 'confirm_password';
            
            await ctx.reply('🔒 Repite la contraseña para confirmar:');
        }
        else if (ctx.session.esperando === 'confirm_password') {
            if (texto !== ctx.session.password) {
                await ctx.reply('❌ Las contraseñas no coinciden.\n\nEnvía tu contraseña de nuevo:');
                ctx.session.esperando = 'password';
                return;
            }
            
            // Crear usuario
            const { data: newUser, error } = await supabase
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
                console.error('Error creando usuario:', error);
                await ctx.reply('❌ Error al registrar. Intenta de nuevo más tarde.');
                ctx.session = {};
                return;
            }
            
            console.log('✅ Usuario registrado:', newUser);
            
            ctx.session = {};
            
            await ctx.reply('✅ *¡Registro exitoso!*\n\nBienvenido al sistema de recargas 1xBet.', { parse_mode: 'Markdown' });
            await mostrarMenuUsuario(ctx);
        }
        
    } catch (error) {
        console.error('❌ Error procesando mensaje:', error);
        await ctx.reply('❌ Error. Por favor usa /start para reiniciar.');
        ctx.session = {};
    }
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
        
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (error) {
        console.error('❌ Error al iniciar bot:', error);
        process.exit(1);
    }
}

iniciarBot();