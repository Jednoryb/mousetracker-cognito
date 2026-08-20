// SZABLON KONFIGURACYJNY
// 1. Zmień nazwę tego pliku na 'config.js'
// 2. Wklej poniżej swoje dane z panelu Supabase (Project Settings -> API)

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'TUTAJ_PODAJ_SWOJ_URL';
const SUPABASE_ANON_KEY = 'TUTAJ_PODAJ_SWOJ_KLUCZ_ANON';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);