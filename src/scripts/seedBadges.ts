import { query } from "../config/db";
import pool from "../config/db";
import { CacheService } from "../utils/cache";
import redisClient from "../config/redis";

async function seedBadges() {
  console.log("🚀 Iniciando seed de insignias...");
  try {
    // 1. Agregar columna de color si no existe
    await query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'badges' AND column_name = 'color') THEN 
                    ALTER TABLE public.badges ADD COLUMN color varchar(100); 
                END IF; 
            END $$;
        `);
    console.log("- Columna 'color' verificada.");

    // 2. Asegurar Unique Constraint en 'name'
    await query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'badges_name_key') THEN 
                    ALTER TABLE public.badges ADD CONSTRAINT badges_name_key UNIQUE (name); 
                END IF; 
            END $$;
        `);
    console.log("- Constraint UNIQUE en 'name' verificada.");

    // 3. Insertar/Actualizar Insignias
    await query(`
            INSERT INTO public.badges (name, description, icon_url, criteria_type, criteria_value, rarity, color)
            VALUES
                -- TIER 1: IDENTITY
                ('Validado', 'Identidad verificada exitosamente. Ciudadano confiable.', 'shield-check', 'MANUAL', NULL, 'COMMON', 'text-blue-400 fill-blue-400/20'),
                ('Fundador', 'Pionero registrado durante la fase Beta. Visionario.', 'rocket', 'EARLY_ADOPTER', NULL, 'RARE', 'text-cyan-400 fill-cyan-400/20'),
                ('Beta Tester', 'Ingeniero de campo que ayudó a pulir el sistema.', 'bug', 'MANUAL', NULL, 'RARE', 'text-lime-400 fill-lime-400/20'),
            
                -- TIER 2: ACHIEVEMENTS
                ('Vendedor Estrella', 'Comerciante de élite con más de 10 ventas confirmadas.', 'star', 'SALES_COUNT', 10, 'EPIC', 'text-amber-400 fill-amber-400/20'),
                ('Alto Saldo', 'Poder adquisitivo superior a 500 créditos.', 'wallet', 'PL_BALANCE', 500, 'RARE', 'text-emerald-400 fill-emerald-400/20'),
                ('Cazador', 'Rastreador experto con 5 hallazgos de Ghost Drops.', 'eye', 'GHOST_FIND_COUNT', 5, 'EPIC', 'text-orange-500 fill-orange-500/20'),
            
                -- TIER 3: PRESTIGE
                ('Coleccionista', 'Curador de rarezas con más de 20 artículos únicos.', 'gem', 'ITEM_COUNT', 20, 'EPIC', 'text-purple-400 fill-purple-400/20'),
                ('Líder Comunitario', 'Influencer con red de más de 50 invitados.', 'users', 'REFERRAL_COUNT', 50, 'LEGENDARY', 'text-rose-400 fill-rose-400/20'),
                ('Visionario', 'Arquitecto del futuro con sugerencias implementadas.', 'zap', 'MANUAL', NULL, 'LEGENDARY', 'text-indigo-400 fill-indigo-400/20'),
            
                -- TIER 4: GOD TIER
                ('Leyenda', 'Icono viviente. Top 1% del campus.', 'crown', 'MANUAL', NULL, 'LEGENDARY', 'text-yellow-200 fill-yellow-200/20 drop-shadow-[0_0_10px_rgba(253,224,71,0.5)]'),
                ('Magnate', 'Imperio económico superior a 10,000 créditos.', 'trophy', 'PL_BALANCE', 10000, 'LEGENDARY', 'text-emerald-300 fill-emerald-300/20'),
                ('Filántropo', 'Corazón de oro con más de 100 créditos donados.', 'heart', 'DONATION_COUNT', 100, 'EPIC', 'text-pink-400 fill-pink-400/20')
            
            ON CONFLICT (name) 
            DO UPDATE SET 
                description = EXCLUDED.description, 
                icon_url = EXCLUDED.icon_url, 
                criteria_type = EXCLUDED.criteria_type, 
                criteria_value = EXCLUDED.criteria_value,
                rarity = EXCLUDED.rarity,
                color = EXCLUDED.color;
        `);
    console.log("✅ Insignias actualizadas exitosamente.");

    console.log("🔄 Invalidando caché...");
    await CacheService.delete("badges:all");
    await CacheService.deleteByPattern("user:badges:*");
    await CacheService.deleteByPattern("user:profile:*");
    console.log("✅ Caché invalidado.");
  } catch (error) {
    console.error("❌ Error al sembrar insignias:", error);
  } finally {
    await pool.end();
    if (redisClient.isOpen) await redisClient.quit();
    process.exit(0);
  }
}

seedBadges();
