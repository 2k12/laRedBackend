-- Advertising & Badges Migration
-- 1. Advertising Packages (Services offered by SYSTEM)
CREATE TABLE IF NOT EXISTS advertising_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(20, 2) NOT NULL,
    duration_hours INTEGER NOT NULL,
    type VARCHAR(50) DEFAULT 'SLIDE_PRINCIPAL',
    -- 'SLIDE_PRINCIPAL', 'SEARCH_BOOST'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 2. Product Ads (Active subscriptions)
CREATE TABLE IF NOT EXISTS product_ads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    package_id UUID REFERENCES advertising_packages(id),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 3. Badges Repository
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url TEXT,
    criteria_type VARCHAR(50) NOT NULL,
    -- 'SALES_COUNT', 'PL_BALANCE', 'EARLY_ADOPTER'
    criteria_value INTEGER,
    rarity VARCHAR(20) DEFAULT 'COMMON',
    -- 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 4. User Badges (Earned badges)
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
);
-- Seed Initial Ads Packages
INSERT INTO advertising_packages (name, description, price, duration_hours, type)
VALUES (
        'Bronce Slide',
        'Aparece en el slide principal por 24 horas',
        50.00,
        24,
        'SLIDE_PRINCIPAL'
    ),
    (
        'Plata Slide',
        'Aparece en el slide principal por 3 días',
        120.00,
        72,
        'SLIDE_PRINCIPAL'
    ),
    (
        'Oro Slide',
        'Aparece en el slide principal por 7 días',
        250.00,
        168,
        'SLIDE_PRINCIPAL'
    );
-- Seed Initial Badges
INSERT INTO badges (
        name,
        description,
        icon_url,
        criteria_type,
        criteria_value,
        rarity
    )
VALUES (
        'Pionero',
        'Registrado durante la fase beta de LaRed.',
        'pioneer-icon',
        'EARLY_ADOPTER',
        NULL,
        'RARE'
    ),
    (
        'Vendedor Estrella',
        'Completó más de 10 ventas exitosas.',
        'star-seller-icon',
        'SALES_COUNT',
        10,
        'EPIC'
    ),
    (
        'Millonario',
        'Superó un balance de 500 Pulsos.',
        'millionaire-icon',
        'PL_BALANCE',
        500,
        'EPIC'
    ),
    (
        'Verificado',
        'Identidad verificada por el sistema.',
        'verified-icon',
        'MANUAL',
        NULL,
        'COMMON'
    );