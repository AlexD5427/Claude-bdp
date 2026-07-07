# Backend de KPIs — pestaña «Dashboard y KPIs»

> **Novedad (módulo Documentación + DISC):** el archivo
> [`Documentacion.gs`](./Documentacion.gs) es un **reemplazo directo** del script
> del Web App actual. Es retrocompatible (mismo `GET`/`POST` de postulantes) y
> agrega: `arquetipos_disc` al `GET`, la persistencia de expedientes de
> documentación y el **envío automático de recordatorios cada 3 días**. Ver la
> sección [«Módulo Documentación y DISC»](#módulo-documentación-y-disc) más abajo.

Este documento describe el modelo de datos y el despliegue del backend que
respalda el módulo **Dashboard** y los KPIs por módulo. El frontend ya está
preparado para consumirlo; mientras no se despliegue, el dashboard funciona con
un almacén local (`localStorage`) que acumula el historial mes a mes y muestra
N/A donde corresponde.

> El agente no tiene acceso de red al Google Apps Script ni al Google Sheet, por
> eso esta parte se entrega como **código para pegar** (`Code.gs`) + el esquema.

## 1 · Contrato de datos (Web App)

`GET` (ampliado, retrocompatible):

```jsonc
{
  "candidatos":   [ /* … igual que hoy … */ ],
  "competencias": [ "…" ],
  "kpis":   { "2026-05": { "tiempo_contratacion": 18, "tasa_rotacion": 7, … }, … },
  "estados":[ { "identificador":"8456872-105-2026", "status":"contratado", … } ]
}
```

`POST` (enrutado por `type`):

| `type` | Cuerpo | Acción |
| --- | --- | --- |
| `kpi_snapshot` | `{ type, month:"YYYY-MM", values:{ key:number\|null } }` | Reescribe las filas del periodo en «Dashboard y KPIs». |
| `hiring_status` | `{ type, identificador, status, firstSeenAt, contratadoAt?, bajaAt? }` | Upsert en «Estados de Contratación». |
| _(sin type)_ | objeto postulante | Alta de postulante (comportamiento actual). |

## 2 · Esquema de hojas

### Hoja «Dashboard y KPIs» (formato largo / *tidy*)

Una fila por (periodo, KPI). Es el formato más optimizado para series
temporales: escala sin límite y se filtra por `modulo`, `periodo` o `kpi` con un
autofiltro. La "sección por módulo" se obtiene con la columna `modulo`.

| periodo | anio | mes | modulo | kpi | etiqueta | valor | unidad | registrado_en |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05 | 2026 | 05 | dashboard | tiempo_contratacion | Tiempo de Contratación | 18 | días | 2026-05-31T23:59 |
| 2026-05 | 2026 | 05 | postulantes | num_candidatos | Número de Candidatos | 240 | | 2026-05-31T23:59 |

### Hoja «Estados de Contratación»

| identificador | status | firstSeenAt | contratadoAt | bajaAt | updatedAt |
| --- | --- | --- | --- | --- | --- |
| 8456872-105-2026 | contratado | 2026-04-02 | 2026-04-20 | | 2026-04-20 |

`status ∈ { en_proceso, contratado, baja }`. Estas fechas alimentan **Tiempo de
Contratación** y **Tasa de Rotación**.

## 3 · Despliegue

1. Abra el editor de Apps Script del libro (Extensiones → Apps Script).
2. Pegue el contenido de `Code.gs`. **Adapte** `leerPostulantes_`,
   `leerCompetencias_` y `appendPostulante_` a su lógica actual (o reutilice las
   que ya tiene; sólo necesita que `doGet`/`doPost` enruten como aquí).
3. Ejecute `installTriggers()` una vez (autorice permisos). Esto crea un
   disparador **diario ~23:00** que, **sólo el último día del mes**, congela los
   KPIs del mes con `snapshotMensual()` (cierre "a fin de mes, justo antes del
   cambio de día").
4. Vuelva a **Implementar → Administrar implementaciones → Editar → Nueva
   versión**. Mantenga "Cualquiera con el enlace".

> El frontend además envía un `kpi_snapshot` del mes en curso de forma continua
> (respaldo). El registro **autoritativo** es el del trigger del paso 3.

## 4 · Informe — KPIs por módulo y cómo se calculan

Selección basada en métricas estándar de *talent acquisition* (estilo
Greenhouse / Evaluar.com) acotadas a los datos disponibles del banco.

### Dashboard (panel ejecutivo)

| KPI | Cálculo | Estado |
| --- | --- | --- |
| **Calidad de Contratación** | Media de evaluaciones de desempeño de los primeros meses (desempeño + integración + productividad). | **N/A** — pendiente de conectar la base de evaluaciones de desempeño. |
| **Tiempo de Contratación** | Promedio de días entre `firstSeenAt` (ingreso al proceso) y `contratadoAt` (etiqueta «Contratado»). Menos es mejor. | Activo |
| **Costo por Contratación** | Costo total de cubrir la vacante / contrataciones del periodo. | **N/A** — proviene de base externa de costos. |
| **Tasa de Rotación** | Bajas dentro de ~90 días ÷ total de contratados del periodo, en %. Menos es mejor. | Activo |

Complementos del Dashboard: **Demografía de Empleados** (distribución por
Gerencia — requiere columna `gerencia`; mientras tanto agrupa por `cargo_bdp`),
**Nuevas Adiciones al Banco** (últimos 5 registros) e **Histórico de
Contrataciones** (contratados por mes, con filtros 3/6/12 meses).

### Lista de Postulantes

Número de Candidatos · Procesos Activos · Promedio Competencias · Competencias
Catalogadas. (Los cuatro indicadores originales, ahora con tendencia mensual.)

### Comparador

| KPI | Cálculo |
| --- | --- |
| Perfiles con Competencias | Postulantes con al menos una competencia configurada. |
| Ajuste Promedio | Media de `ajuste` (obtenido/esperado) de todas las competencias. |
| Brecha Promedio | Media de `brecha` (obtenido − esperado); cercano a 0 es mejor. |
| Competencias Evaluadas | Cantidad de competencias distintas evaluadas. |

### Cara a Cara

Nota CAP Promedio · Currículum Promedio · Conocimientos Promedio · Competencias
Promedio — medias de las notas respectivas. Útiles como línea base del duelo.

### Procesos

Procesos Activos · Postulantes/Proceso (promedio) · Proceso Más Grande ·
Sin Proceso (identificadores fuera de formato — menos es mejor).

### Tablero

% Confiables · % Integridad Alta · % Riesgo Robo Alto (menos es mejor) ·
Competencias Promedio.

> Todos los KPIs (de todos los módulos) se vuelcan al mismo formato largo de la
> hoja «Dashboard y KPIs» con su `modulo`, de modo que cada tarjeta del frontend
> puede desplegar su histórico mensual desde una única fuente.

---

## Módulo Documentación y DISC

El script [`Documentacion.gs`](./Documentacion.gs) amplía el Web App. Pegue su
contenido en el editor de Apps Script del libro (reemplazando el script actual) y
vuelva a implementar (**Implementar → Administrar implementaciones → Editar →
Nueva versión**, "Cualquiera con el enlace").

### 1 · `GET` ampliado (retrocompatible)

```jsonc
{
  "candidatos":      [ /* … igual que hoy (primera pestaña) … */ ],
  "competencias":    [ "…" ],           // hoja "Auxiliar", columna A
  "arquetipos_disc": [                    // hoja "Auxiliar", columna "arquetipo_disc"
    "Director (D), Directo, decidido y orientado a resultados…",
    "Analítico (C), Preciso, prudente y orientado a la calidad…"
  ]
}
```

- **`arquetipos_disc`**: en la hoja **Auxiliar**, cree una columna cuyo
  encabezado (fila 1) sea exactamente `arquetipo_disc`. Cada celda usa el formato
  `Nombre (Código), Descripción…`. El texto **antes** de la primera coma alimenta
  el desplegable de Arquetipo DISC; el texto **después** de la coma es lo que se
  muestra en el pop-up de información (icono «!»). Mientras la columna no exista,
  el frontend usa un catálogo de respaldo integrado.
- Igual ocurre con **`carrera`**: agregue esa columna (encabezado `carrera`) a la
  hoja de postulantes para que el nuevo campo del cuestionario se guarde y lea.

### 2 · `POST` del módulo Documentación

| Cuerpo | Acción |
| --- | --- |
| `{ type:"documentacion", action:"upsert", dossier:{…} }` | Reescribe todas las filas del expediente en la hoja «Documentación». |
| `{ type:"documentacion", action:"delete", identificador }` | Elimina el expediente. |
| `{ type:"documentacion_email", identificador, to, cc, subject, kind, missingCount }` | Registra el aviso en «Avisos Documentación». |

Hoja **«Documentación»** (formato largo, una fila por documento):

| identificador | nombre | cargo | agencia | gerencia | correo | fecha_ingreso | grupo | documento_id | documento | estado | paginas | observacion | prorroga | actualizado_en |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

`estado ∈ { pendiente, presentado, observado, no_aplica }`.

### 3 · Recordatorios automáticos por correo

`enviarRecordatoriosDocumentacion()` recorre la hoja «Documentación», agrupa por
persona y, cuando los días desde `fecha_ingreso` son múltiplo de
`CONFIG_DOC.INTERVALO_DIAS` (por defecto **3**), envía un correo con la lista de
documentos faltantes y copia (CC) al `CONFIG_DOC.CC_AUXILIAR`. Configure el CC y,
si desea, el asunto/plantilla en el objeto `CONFIG_DOC` al inicio del archivo.

Instale el disparador **una sola vez** ejecutando
`instalarTriggersDocumentacion()` (autorice los permisos de correo). Crea un
trigger diario ~08:00 que revisa y envía los recordatorios que correspondan ese
día. El panel del frontend permite además revisar, editar y enviar avisos
manualmente (o disparar el envío automático con vista previa y confirmación,
según la configuración).
