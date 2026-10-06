# Asistente de consultas del portal

El botón **Consultar** abre un chat de Claude dentro del portal. Usa la sesión del usuario y las seis consultas de lectura del MCP: buscar recetas, consultar costos, buscar insumos, consultar receta, recetas por insumo y alertas. No requiere conectar Claude web ni iniciar OAuth. No ofrece escritura ni SQL libre.

## Activación

1. Publicar la migración `20261006000010_chat_cupos.sql` desde el repositorio, a cargo del propietario:

   ```powershell
   npx.cmd supabase db push
   ```

2. En Vercel → proyecto → Settings → Environment Variables, agregar **ANTHROPIC_API_KEY** para Production (y Preview si se va a probar ahí). Obtenerla en la consola de Anthropic; no compartirla por chat ni guardarla en Git. La API tiene facturación independiente de Claude web.
3. Opcional: `CHAT_MODEL` permite cambiar el modelo. El valor predeterminado es `claude-sonnet-5-5`.
4. Volver a desplegar Vercel para aplicar las variables. Iniciar sesión en el portal y preguntar por el costo de un producto conocido; comparar tamaño y canal contra su ficha.

Si falta la clave o la migración, el chat responde que aún no está disponible y no llama al proveedor. El código no publica migraciones ni configura cuentas automáticamente.

## Límites y datos

- 5 consultas por minuto y 60 por día UTC por usuario; 300 diarias UTC para todo el portal. La reserva atómica en PostgreSQL impide evadir cuotas por concurrencia, reinicios o nuevas conversaciones. Una petición reservada consume cuota aunque se detenga o falle.
- 12 preguntas por conversación, 24.000 caracteres de historial, 2.000 caracteres por pregunta en la interfaz; máximo 4 pasos, 8 consultas de herramientas, 1.800 tokens de salida por paso y 55 segundos por respuesta. Estos límites acotan gasto; no sustituyen un presupuesto monetario en Anthropic.
- El historial vive en memoria del navegador; sobrevive al cierre del widget y se borra con **Nueva conversación**, recarga o cierre de sesión. No se guarda en tablas ni almacenamiento local.
- Claude recibe las preguntas, el texto del historial y los resultados de consultas necesarias. La tabla de cuotas solo guarda usuario, fecha y contadores; no guarda preguntas o respuestas.
- Las consultas ejecutan las políticas RLS con la sesión del usuario. Se verifica cuenta activa en cada petición. El navegador no recibe la clave de Anthropic. El historial entrante admite solo texto; no acepta resultados de herramientas ni instrucciones de sistema.
- Tablas Markdown y enlaces internos a fichas. HTML, imágenes y enlaces externos no se renderizan. Los importes proceden de las vistas SQL; las respuestas del modelo deben contrastarse con la ficha cuando se usan para tomar decisiones.

## Validación

Las pruebas cubren autenticación, origen, perfiles inactivos, cuotas por minuto/día/globales, aislamiento entre usuarios, prohibición de resetear contadores, rechazo de tokens OAuth en la reserva, límites de entrada y errores sanitizados. La interfaz cubre foco, envío, detener, tablas, enlaces y reinicio.

La verificación con Anthropic y la base publicada queda a cargo del propietario después de configurar la clave y publicar la migración. Las pruebas automatizadas no usan claves reales ni consumen API.
