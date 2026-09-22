# TALON — PWA de autogestión offline-first con OCR

## Resumen (qué hace este proyecto)

Es una **app de campo** para subir **comprobantes de pago** con mala (o nula) red.

El usuario toma la foto del recibo. Un modelo ligero **en el dispositivo** lee monto y fecha. Si no hay internet, Angular guarda imagen + datos en **IndexedDB** y un **service worker** avisa para sincronizar en background apenas vuelve la conexión.

Se puede **instalar** (PWA: manifest + `sw.js`). El botón **Simular sin red** deja la cola pendiente aunque el Wi‑Fi esté vivo — para demo en escritorio.

No es KYC ni e-commerce: **captura, OCR, cola, sync**.

**Stack:** Angular 21 (Signals + `OnPush`) · Service Worker · IndexedDB · Tesseract.js (fotos reales) · pista on-device en recibos de prueba · Node/Express · **Drizzle** · MySQL (XAMPP).

---

## Arquitectura hexagonal

El hexágono es **capturar un comprobante y conciliarlo**. Cámara, IndexedDB, Tesseract y MySQL son adaptadores. El dominio no se rompe si no hay red: el puerto de salida “sync” puede esperar.

```
     cámara / demo canvas          IndexedDB + Service Worker
     (adaptador captura)           (adaptador cola local)
              │                              │
              ▼                              ▼
         ┌────┴──────────────────────────────┴────┐
         │            DOMINIO TALON               │
         │  vision.ts  strip + parse monto/fecha  │
         │  field.service  cola pending/ok        │
         └────┬──────────────────────────────┬────┘
              │                              │
     adaptador OCR                    adaptador sync HTTP
     ocr.service (Tesseract)          POST /api/receipts
                                      db.js Drizzle o RAM
```

| Capa | Qué es | Archivos |
|---|---|---|
| **Dominio** | Qué es un recibo (monto, fecha, comercio), estados `pending/syncing/ok`, parseo de texto OCR. | `models.ts`, `vision.ts` (`parseOcrText`, pista binaria), reglas de cola en `field.service.ts` |
| **Puertos de entrada** | “Capturaron una foto” / “el SW pide flush”. | `captureFile`, `captureDemo`, mensaje `talon-sync` |
| **Adaptadores de entrada** | Input `capture=environment`, canvas de demo, `public/sw.js`. | `app.ts`, `public/sw.js`, `manifest.webmanifest` |
| **Puertos de salida** | “Guarda local” / “sube al servidor” / “lee la imagen”. | `idbPut`, `flush()`, `OcrService.read()` |
| **Adaptadores de salida** | IndexedDB, `POST /api/receipts` + Drizzle, Tesseract o strip on-device. | `idb.ts`, `server.js` + `db.js`, `ocr.service.ts` |

`forcedOffline` corta el adaptador HTTP y deja intactos dominio + IndexedDB. Por eso “Simular sin red” es una demo del hexágono: cambias un adaptador, no la cola.

---

## Arranque

### 1. Base de datos (Drizzle)

1. XAMPP → **MySQL → Start**.
2. Copia `.env.example` a `.env` si usas otra clave.

```bash
cd c:\xampp\htdocs\nivelDos\PwaAutogestion
npm run db:setup
```

Crea la base `talon` y las tablas `receipts` + `sync_events`.

`DATABASE_URL=mysql://root:@127.0.0.1:3306/talon`

### 2. App de campo

```bash
npm start
```

| Proceso | Puerto | URL |
|---|---|---|
| API Node | `3301` | http://localhost:3301/api/health |
| Angular PWA | `4230` | http://localhost:4230 |

```bash
npm run api
npm run field
npm run db:push
```

El proxy manda `/api` de `:4230` a `:3301`. Sin MySQL el sync cae a memoria del API (`"store": "memory"`). IndexedDB del browser **siempre** guarda.

Build instalable:

```bash
npm run build
```

Usa `ngsw-config.json` (service worker de Angular) además de `public/sw.js` en desarrollo.

---

## Drizzle (tablas)

| Tabla Drizzle | Tabla MySQL | Qué guarda |
|---|---|---|
| `receipts` | `receipts` | Monto, fecha, comercio, OCR, thumbnail base64, status |
| `syncEvents` | `sync_events` | Cada upsert desde la PWA |

El runtime usa Drizzle. mysql2 solo para `CREATE DATABASE`.

---

## Rutas

Angular **sin rutas de página**. Una vista: cámara + cola.

### HTTP API (`:3301`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/health` | Liveness + `store` |
| `GET` | `/api/receipts` | Recibos ya sincronizados |
| `POST` | `/api/receipts` | Upsert desde IndexedDB (offline → online) |

---

## Flujo

1. **Tomar / subir foto** o **Generar recibo de prueba**.
2. La imagen se escribe ya en IndexedDB (`sync: pending`) aunque el OCR no haya terminado.
3. Visión:
   - Recibo de prueba: **pista binaria** en el margen (modelo ligero on-device, sin red). Extrae monto, fecha y comercio en ms.
   - Foto real: **Tesseract.js** en el browser (`spa+eng`). La primera vez baja el modelo; después queda cacheado. Regex de `TOTAL` / fecha sobre el texto.
4. Si OCR falla, el monto se edita a mano; el blob no se pierde.
5. `FieldService.flush()` corre al evento `online`, cada 8 s, al volver a la pestaña, y cuando el SW manda `talon-sync` (`Background Sync` si el browser lo soporta).
6. **Simular sin red** bloquea el POST. Los ítems quedan `pending`. Al salir del modo, suben.

---

## Archivos

```
PwaAutogestion/
  drizzle.config.mjs
  api/src/schema.js
  ngsw-config.json           SW de producción (ng build)
  public/sw.js               SW de desarrollo + Background Sync ping
  public/manifest.webmanifest
  api/src/server.js
  api/src/setup-db.js
  api/src/db.js
  src/app/app.ts             Cámara + cola
  src/app/field.service.ts   IndexedDB + sync background
  src/app/ocr.service.ts     Strip + Tesseract
  src/app/vision.ts          Recibo demo + decode + parse
  src/app/idb.ts             Wrapper IndexedDB
  src/app/models.ts
```

---

## Demo

1. **Generar recibo de prueba** → monto y fecha se rellenan solos (`ocrStatus: done`, engine strip).
2. **Simular sin red** → otro recibo queda `pending`.
3. Salir de modo campo → pasa a `ok` (API en `:3301`).
4. Chrome → icono de instalar (manifest). En el teléfono, “Añadir a pantalla de inicio”.
5. Foto de un recibo de verdad: espera el modelo Tesseract; si no hay red y no está cacheado, completa el monto a mano.

---

## Cómo se construyó (paso a paso)

Backend **Node/Express**. ORM **Drizzle**. Front **PWA** (manifest + SW). OCR **en el dispositivo**.

1. App Angular 21:

```bash
cd c:\xampp\htdocs\nivelDos
ng new talon --directory PwaAutogestion --routing --style=scss --ssr=false --skip-git --skip-tests --defaults
cd PwaAutogestion
npm install express cors mysql2 drizzle-orm concurrently wait-on tesseract.js @angular/service-worker
npm install -D drizzle-kit
```

2. **Dominio de visión**: `vision.ts` — dibuja recibo de prueba, pista binaria on-device, `parseOcrText` (regex TOTAL / fecha). `models.ts` (`Receipt`, `SyncState`).

3. **Puerto de salida local**: `idb.ts` (object store `receipts`).

4. **Adaptador OCR**: `ocr.service.ts` — primero strip; si no, Tesseract `spa+eng`.

5. **Caso de uso cola**: `field.service.ts` — ingest → IndexedDB `pending` → OCR → `flush()` en `online`, intervalo 8 s, `visibilitychange`, mensaje SW. Flag `forcedOffline`.

6. **Adaptador UI**: `app.ts` cámara + lista + “Simular sin red”. Puerto `:4230`.

7. **PWA**: `public/manifest.webmanifest`, `public/sw.js` (cache + ping `talon-sync`), `ngsw-config.json` para `ng build`.

8. **Adaptador servidor**: `schema.js` (`receipts`, `sync_events`), `db.js`, `setup-db.js` (base `talon`), `server.js` `:3301` — health, GET/POST receipts (upsert Drizzle). `proxy.conf.json` `/api` → `:3301`.

9. `npm start` = API + `ng serve --port 4230`. El sync **nunca** bloquea la captura: eso es el puerto de salida asíncrono del hexágono.
