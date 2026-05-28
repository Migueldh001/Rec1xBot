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
    console.log('🔐 Verificando contraseña para:', ctx.session.user_data.bet_id);
    
    const userData = ctx.session.user_data;
    
    try {
        // Verificar contraseña con Supabase Auth
        const email = userData.is_admin 
            ? 'admin@1xbet.com' 
            : `${userData.bet_id}@1xbet-user.local`;
        
        console.log('   Email para login:', email);
        
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: texto
        });
        
        if (authError) {
            console.log('❌ Error auth:', authError.message);
            
            // Si es admin, verificar contraseña hardcodeada como fallback
            if (userData.is_admin && texto === 'Recarga1xbet') {
                console.log('✅ Admin con contraseña hardcodeada');
            } else {
                await ctx.reply('❌ Contraseña incorrecta.\n\nIntenta de nuevo:');
                return;
            }
        } else {
            console.log('✅ Contraseña correcta');
        }
        
        // Actualizar telegram_id si no está
        if (userData.telegram_id !== ctx.from.id) {
            await supabase
                .from('users')
                .update({ telegram_id: ctx.from.id })
                .eq('id', userData.id);
            
            console.log('✅ telegram_id actualizado');
        }
        
        // Recargar admins si es admin
        if (userData.is_admin) {
            await cargarAdmins();
        }
        
        ctx.session = {};
        
        await ctx.reply('✅ Sesión iniciada correctamente');
        
        if (userData.is_admin) {
            await mostrarMenuAdmin(ctx);
        } else {
            await mostrarMenuUsuario(ctx);
        }
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        await ctx.reply('❌ Error al iniciar sesión.\n\nUsa /start para reintentar.');
        ctx.session = {};
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
    
    try {
        console.log('📝 Intentando registrar usuario...');
        console.log('   bet_id:', ctx.session.bet_id);
        console.log('   phone:', ctx.session.phone);
        console.log('   telegram_id:', ctx.from.id);
        
        // Verificar si el bet_id ya existe
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('bet_id')
            .eq('bet_id', ctx.session.bet_id)
            .single();
        
        if (existingUser) {
            await ctx.reply('❌ Este ID 1xBet ya está registrado.\n\nUsa /start para iniciar sesión.');
            ctx.session = {};
            return;
        }
        
        // Verificar si el telegram_id ya existe
        const { data: existingTelegram } = await supabase
            .from('users')
            .select('telegram_id')
            .eq('telegram_id', ctx.from.id)
            .single();
        
        if (existingTelegram) {
            await ctx.reply('❌ Ya tienes una cuenta registrada.\n\nUsa /start para iniciar sesión.');
            ctx.session = {};
            return;
        }
        
        // Crear usuario en Auth de Supabase
        const email = `${ctx.session.bet_id}@1xbet-user.local`;
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: ctx.session.password,
            options: {
                data: {
                    bet_id: ctx.session.bet_id,
                    phone: ctx.session.phone
                }
            }
        });
        
        if (authError) {
            console.error('❌ Error en Auth:', authError);
            throw authError;
        }
        
        console.log('✅ Usuario creado en Auth');
        
        // Insertar en tabla users
        const { data: userData, error: dbError } = await supabase
            .from('users')
            .insert([{
                id: authData.user.id,
                bet_id: ctx.session.bet_id,
                phone: ctx.session.phone,
                telegram_id: ctx.from.id,
                is_admin: false
            }])
            .select()
            .single();
        
        if (dbError) {
            console.error('❌ Error insertando en BD:', dbError);
            console.error('   Code:', dbError.code);
            console.error('   Message:', dbError.message);
            console.error('   Details:', dbError.details);
            throw dbError;
        }
        
        console.log('✅ Usuario creado en BD:', userData);
        
        ctx.session = {};
        
        await ctx.reply('✅ ¡Registro exitoso!\n\nYa puedes usar el sistema de recargas.');
        await mostrarMenuUsuario(ctx);
        
    } catch (error) {
        console.error('❌ Error completo en registro:', error);
        console.error('   Stack:', error.stack);
        
        let errorMsg = '❌ Error al registrar. ';
        
        if (error.message?.includes('already registered')) {
            errorMsg += 'Este email ya existe.';
        } else if (error.code === '23505') {
            errorMsg += 'Este ID ya está registrado.';
        } else {
            errorMsg += 'Intenta más tarde.';
        }
        
        await ctx.reply(errorMsg + '\n\nUsa /start para volver.');
        ctx.session = {};
    }
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

// TEST DE CONEXIÓN A SUPABASE
async function testSupabase() {
    console.log('\n=== TEST SUPABASE ===');
    console.log('URL:', process.env.SUPABASE_URL);
    console.log('Key existe:', !!process.env.SUPABASE_ANON_KEY);
    
    try {
        // Test 1: Ver todos los usuarios
        const { data: allUsers, error: error1 } = await supabase
            .from('users')
            .select('*');
        
        console.log('\n📊 Todos los usuarios:');
        console.log('   Cantidad:', allUsers?.length || 0);
        console.log('   Datos:', allUsers);
        console.log('   Error:', error1);
        
        // Test 2: Buscar '1xbet'
        const { data: adminUser, error: error2 } = await supabase
            .from('users')
            .select('*')
            .eq('bet_id', '1xbet')
            .single();
        
        console.log('\n🔍 Búsqueda de 1xbet:');
        console.log('   Encontrado:', !!adminUser);
        console.log('   Datos:', adminUser);
        console.log('   Error:', error2);
        console.log('   Error code:', error2?.code);
        
        // Test 3: Buscar sin single()
        const { data: adminUser2, error: error3 } = await supabase
            .from('users')
            .select('*')
            .eq('bet_id', '1xbet');
        
        console.log('\n🔍 Búsqueda sin single():');
        console.log('   Datos:', adminUser2);
        console.log('   Error:', error3);
        
    } catch (err) {
        console.error('❌ Error en test:', err);
    }
    console.log('=== FIN TEST ===\n');
}

testSupabase();
        
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

iniciarBot();
