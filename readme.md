Architektura Bazy Danych (Supabase / PostgreSQL)
Baza danych została zaprojektowana w modelu relacyjnym, z wykorzystaniem natywnych funkcji PostgreSQL (takich jak typy danych JSONB dla elastyczności). Jej struktura zapewnia izolację ciężkich danych strumieniowych (trajektorie) od danych agregacyjnych (wyniki prób), co gwarantuje wysoką wydajność działania panelu badacza oraz szybki zapis wyników.

Opis Tabel i Relacji
experiments (Eksperymenty / Grupy Badawcze)

Rola: Stanowi najwyższy poziom hierarchii. Reprezentuje konkretne badanie (np. "Percepcja bodźców wzrokowych - Grupa A").

Kluczowe pola: name (nazwa badania), is_active (flaga pozwalająca na włączanie/wyłączanie zbierania danych).

stimuli (Bodźce / Pytania)

Rola: Przechowuje informacje o poszczególnych ekranach pokazywanych w trakcie eksperymentu.

Kluczowe pola: image_url (odniesienie do pliku w Supabase Storage), is_calibration (flaga oznaczająca, czy pytanie służy do kalibracji profilu motorycznego, czy jest częścią właściwego badania), correct_answer (definicja poprawnej strony: left lub right), order_index (kolejność wyświetlania).

Relacje: Powiązana z tabelą experiments (wiele bodźców do jednego eksperymentu).

participants (Uczestnicy)

Rola: Przechowuje zanonimizowane dane z początkowej ankiety.

Kluczowe pola: demographics (typ JSONB). Wykorzystanie JSONB pozwala badaczom na swobodne zmienianie pytań w ankiecie (np. wiek, płeć, ręczność, wady wzroku) bez konieczności modyfikowania struktury tabeli za każdym razem.

sessions (Sesje Badawcze)

Rola: Łączy uczestnika z konkretnym eksperymentem. Rejestruje globalny czas udziału oraz metadane środowiskowe.

Kluczowe pola: started_at, completed_at (pozwalają na wyliczenie całkowitego czasu trwania badania oraz odfiltrowanie osób, które porzuciły test w trakcie), device_info (JSONB – zapisuje rozdzielczość ekranu, system operacyjny i przeglądarkę – kluczowe dla upewnienia się, że warunki sprzętowe nie zaburzyły wyników).

trials (Próby / Wyniki Zadań)

Rola: Serce systemu analitycznego. Zapisuje punktowy wynik dla każdej interakcji z obrazkiem (pojedynczym bodźcem).

Kluczowe pola: response_time_ms (czas reakcji w milisekundach), chosen_answer (wybór badanego), is_correct (weryfikacja automatyczna wyliczana na frontendzie), fullscreen_interrupted (flaga bezpieczeństwa, zaznaczana gdy badany naciśnie klawisz ESCAPE podczas trwania próby).

trajectories (Trajektorie Ruchu)

Rola: Tabela przeznaczona wyłącznie do przechowywania "ciężkich" danych strumieniowych. Wyodrębnienie ich chroni główną tabelę trials przed spowolnieniami.

Kluczowe pola: tracking_data (JSONB). Przechowuje ustrukturyzowany obiekt zawierający trzy tablice z zachowaniem precyzji sub-milisekundowej:

x: [-0.12, -0.15, ...] (pozycja horyzontalna od -1 do 1)

y: [0.05, 0.08, ...] (pozycja wertykalna od -1 do 1)

t: [16.4, 32.1, ...] (stempel czasowy względem pojawienia się obrazka).

Relacje: Powiązanie 1:1 z tabelą trials (trial_id jest unikalne).