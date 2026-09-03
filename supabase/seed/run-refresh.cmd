@echo off
echo ===== %date% %time% ===== >> "C:\Users\macke\OneDrive\Desktop\Apps en proceso\Reservas Restaurantes\supabase\seed\refresh.log"
"C:\Program Files\nodejs\node.exe" "C:\Users\macke\OneDrive\Desktop\Apps en proceso\Reservas Restaurantes\supabase\seed\refresh.mjs" >> "C:\Users\macke\OneDrive\Desktop\Apps en proceso\Reservas Restaurantes\supabase\seed\refresh.log" 2>&1
echo EXITCODE %errorlevel% >> "C:\Users\macke\OneDrive\Desktop\Apps en proceso\Reservas Restaurantes\supabase\seed\refresh.log"
