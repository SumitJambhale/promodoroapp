-- ==============================================================================
-- POMODORO PRO - SUPABASE POSTGRESQL SCHEMA
-- Execute this script in your Supabase Project's SQL Editor (Dashboard > SQL Editor)
-- ==============================================================================

-- 1. Create Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 1 AND duration_minutes <= 45),
    break_duration_minutes INTEGER NOT NULL DEFAULT 5 CHECK (break_duration_minutes >= 4 AND break_duration_minutes <= 5),
    breaks_used INTEGER NOT NULL DEFAULT 0 CHECK (breaks_used <= 2),
    max_breaks INTEGER NOT NULL DEFAULT 2,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Completed', 'Canceled', 'Repeat')),
    scheduled_by TEXT NOT NULL DEFAULT 'User',
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
    scheduled_date TEXT,
    scheduled_time TEXT,
    chain_id BIGINT,
    chain_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- 2. Create Chains Table
CREATE TABLE IF NOT EXISTS public.chains (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by TEXT NOT NULL DEFAULT 'User',
    priority TEXT NOT NULL DEFAULT 'High' CHECK (priority IN ('High', 'Medium', 'Low')),
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'Completed', 'Canceled')),
    total_duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_duration_minutes <= 120),
    break_duration_minutes INTEGER NOT NULL DEFAULT 10 CHECK (break_duration_minutes >= 10 AND break_duration_minutes <= 15),
    breaks_count INTEGER NOT NULL DEFAULT 0 CHECK (breaks_count <= 2),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

-- 3. Create Chain Items (Dependent Tasks Pipeline) Table
CREATE TABLE IF NOT EXISTS public.chain_items (
    id BIGSERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL REFERENCES public.chains(id) ON DELETE CASCADE,
    task_id BIGINT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL CHECK (step_order >= 1 AND step_order <= 3),
    requires_break_after BOOLEAN DEFAULT FALSE,
    break_duration_minutes INTEGER DEFAULT 10
);

-- 4. Create Notifications Log Table
CREATE TABLE IF NOT EXISTS public.notifications_log (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT REFERENCES public.tasks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    priority TEXT NOT NULL,
    scheduled_datetime TEXT NOT NULL,
    notified_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
    acknowledged BOOLEAN DEFAULT FALSE
);

-- 5. Foreign Key for tasks.chain_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_chain'
    ) THEN
        ALTER TABLE public.tasks
        ADD CONSTRAINT fk_tasks_chain
        FOREIGN KEY (chain_id) REFERENCES public.chains(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 6. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON public.tasks(scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_chain_items_chain ON public.chain_items(chain_id, step_order);

-- 7. Enable Row Level Security (RLS)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

-- 8. Policies for Anon/Public Access (Allows Pomodoro Pro App to Read/Write)
CREATE POLICY "Public tasks access" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public chains access" ON public.chains FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public chain items access" ON public.chain_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public notifications access" ON public.notifications_log FOR ALL USING (true) WITH CHECK (true);

-- 9. Enable Realtime Subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chains;

-- 10. Seed Initial Data
INSERT INTO public.tasks (title, description, duration_minutes, break_duration_minutes, breaks_used, status, scheduled_by, priority, scheduled_date, scheduled_time)
VALUES 
('Design Apple HIG Design Tokens', 'Craft glassmorphic palettes, dynamic SF typography scales, and spring physics variables.', 25, 5, 0, 'New', 'Alex Mercer (Design Lead)', 'High', CURRENT_DATE::text, '18:00'),
('Optimize Supabase Postgres Queries', 'Benchmark PostgREST index hits, verify RLS performance, and test foreign key cascades.', 30, 5, 1, 'New', 'David Chen (Core Arch)', 'Medium', CURRENT_DATE::text, '19:30'),
('Review Meta React UI Components', 'Audit responsive layout fidelity, focus rings, accessibility, and micro-interactions.', 20, 4, 2, 'Completed', 'Sarah Lin (Product)', 'Low', CURRENT_DATE::text, '14:00'),
('Prepare Vercel Production Release', 'Configure vercel.json, set up environment secrets, and verify edge caching rules.', 40, 5, 0, 'Repeat', 'Elena Rostova (Engineering)', 'High', CURRENT_DATE::text, '20:15')
ON CONFLICT DO NOTHING;

-- Seed Sample 3-Task Chain
INSERT INTO public.chains (id, name, description, created_by, priority, status, total_duration_minutes, break_duration_minutes, breaks_count)
VALUES (
    1,
    'Full Stack Sprint (3-Task Chain)',
    'Sequential dependent flow. Consecutive time > 60 min auto-inserts 10-15m break.',
    'Alex Mercer',
    'High',
    'New',
    100,
    10,
    1
) ON CONFLICT DO NOTHING;

INSERT INTO public.tasks (id, title, description, duration_minutes, break_duration_minutes, status, scheduled_by, priority, chain_id, chain_order)
VALUES 
(101, 'Chain Step 1: Architecture Blueprint', 'Sketch dependent microservice modules and Supabase PostgreSQL schema.', 35, 5, 'New', 'Alex Mercer', 'High', 1, 1),
(102, 'Chain Step 2: Implement REST & PostgREST Endpoints', 'Wire up Supabase client, strict validations, and timer controllers.', 30, 5, 'New', 'Alex Mercer', 'High', 1, 2),
(103, 'Chain Step 3: Polish Glassmorphism UI', 'Apply blurred backdrop cards, Apple-style segmented tabs, and dark mode.', 25, 5, 'New', 'Alex Mercer', 'Medium', 1, 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.chain_items (chain_id, task_id, step_order, requires_break_after, break_duration_minutes)
VALUES
(1, 101, 1, false, 0),
(1, 102, 2, true, 10), -- 35 + 30 = 65m > 60m => auto break inserted!
(1, 103, 3, false, 0)
ON CONFLICT DO NOTHING;
