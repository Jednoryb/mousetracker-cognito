// experiment/js/config.js

const supabaseUrl = 'https://oawyxyqmbifqlxdszked.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hd3l4eXFtYmlmcWx4ZHN6a2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzU4NTQsImV4cCI6MjEwMjcxMTg1NH0.bk0YJz7O0Tioetf5gGM_XmOnpJHSqdt16NmA_q80sZk';

// Inicjalizacja instancji bazy danych (window.supabase pochodzi z CDN ładującego się w HTML)
export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);