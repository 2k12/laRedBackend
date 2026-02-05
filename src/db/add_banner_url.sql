DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'stores'
        AND column_name = 'banner_url'
) THEN
ALTER TABLE stores
ADD COLUMN banner_url TEXT;
END IF;
END $$;