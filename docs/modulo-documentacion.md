# Modulo de Documentacion — informe de entrega

> Rama: `feat/documentacion-auxiliar-catalogo` · PR #23 · base `main`
>
> Este documento vive en el repositorio a proposito: la descripcion de un PR se
> pierde al fusionar, y aqui queda versionada junto al codigo que describe.

---

## 1. Resumen ejecutivo

Se reparo el fallo que tumbaba el despliegue, se construyo un catalogo
declarativo unico como fuente de verdad de los requisitos documentales, se
añadio la lectura y reparacion de la hoja `Auxiliar`, se implemento el
asistente de captura por secciones y se añadio exportacion a Excel sin
dependencias nuevas.

La decision de fondo fue **evolutiva, no destructiva**: el trabajo fusionado en
el PR #21 se conserva entero. Nada de lo que ya funcionaba se reescribio.

Lo que cambia para quien usa el modulo:

- Los requisitos dejan de estar copiados en el HTML y pasan a derivarse de un
  catalogo unico. Añadir un requisito es añadir una entrada, no editar cinco
  archivos.
- Agencia y Gerencia se alimentan de la hoja `Auxiliar`, con diagnostico y
  reparacion propios.
- El identificador institucional se valida de verdad, incluidos los carnets con
  guion interno.
- Los expedientes se exportan a `.xlsx` sin instalar nada.

---

## 2. Diagnostico inicial

### 2.1 El fallo que rompia el despliegue

```
src/components/doc/DocDossierDetail.tsx(9,3): error TS6133:
  'ChevronDown' is declared but its value is never read.
Error: Command "npm run build" exited with 2
```

Causa raiz: `tsconfig.app.json` activa `noUnusedLocals`, y el rediseño del
commit `1a30c56` dejo un import huerfano. **Un solo import sobrante bastaba
para dejar la pagina sin desplegar.** Corregido en `main` con el commit
`fd84418` (una linea eliminada, ninguna añadida).

Esta familia de error volvio a aparecer durante este trabajo — se importo
`DocEstadoChips` en el asistente cuando quien lo usa es `DocRequisitoCard` — y
se cazo antes de subir nada.

### 2.2 Problemas encontrados al leer el modulo

| Hallazgo | Consecuencia |
|---|---|
| Los requisitos estaban escritos a mano en el frontend | Añadir uno obligaba a tocar varios sitios y era facil desincronizarlos |
| El nombre visible hacia de identificador | Cambiar una etiqueta rompia los datos guardados |
| No habia lectura de la hoja `Auxiliar` | Agencia y Gerencia no tenian catalogo real |
| El identificador no se validaba | Entraban duplicados por espacios o por doble envio |
| No existia ningun escritor de Excel reutilizable | Solo `docReport.ts` y `print.ts`, ninguno servia |

### 2.3 Un defecto propio, encontrado y corregido

La primera version de `docIdentificador.ts` deformaba el carnet `1234567-1A` en
`1234567 - 1A`, porque espaciaba **todos** los guiones. El guion del
complemento es parte del dato institucional, no un separador. Corregido, y con
dos pruebas de regresion para que no vuelva.

---

## 3. Arquitectura final

```
Catalogo declarativo  ──►  Frontend renderiza desde el catalogo
  (docCatalog.ts)          (nunca HTML copiado)
        │
        ├──►  docTemplate.ts    compatibilidad con los ids heredados
        ├──►  docBorrador.ts    estado del asistente y reglas de avance
        └──►  docExport.ts      libro de Excel

Hoja Auxiliar  ──►  11_Auxiliar.gs  ──►  08_Router.gs  ──►  docAuxiliar.ts
  agencia_bdp                              (3 acciones)      (cache 10 min)
  gerencia_bdp
```

Principio aplicado: **el nombre visible nunca es el identificador**. Cada
requisito tiene un `codigo` estable y, cuando ya existia, un `legacyId` que
mantiene la compatibilidad con lo guardado.

---

## 4. Archivos y su funcion

### Backend (Apps Script)

| Archivo | Funcion |
|---|---|
| `11_Auxiliar.gs` *(nuevo)* | Localiza o crea `Auxiliar`, lee `agencia_bdp` y `gerencia_bdp`, diagnostica y repara. ES5 puro. |
| `08_Router.gs` | Tres acciones nuevas: `auxiliar.opciones`, `auxiliar.validar`, `auxiliar.reparar`. Total 31. |
| `09_Menu.gs` | Dos entradas nuevas de menu y purga de cache en la tarea diaria. |

### Frontend

| Archivo | Funcion |
|---|---|
| `src/lib/doc/docCatalog.ts` | Catalogo declarativo: 40 entradas. Fuente de verdad. |
| `src/lib/docTemplate.ts` | Deriva la plantilla heredada del catalogo. Ya no se mantiene por duplicado. |
| `src/lib/doc/docAuxiliar.ts` | Cliente de catalogos con cache de sesion y valores historicos. |
| `src/lib/doc/docIdentificador.ts` | Analiza `CI - Nro Proceso - Anio` desde el final. |
| `src/lib/doc/docBorrador.ts` | Estado del asistente, validacion, avance, borrador local. |
| `src/lib/doc/docExport.ts` | Escritor `.xlsx` propio (ZIP + XML), sin dependencias. |
| `src/components/doc/DocExpedienteWizard.tsx` | Asistente de seis secciones. |
| `DocIconos.tsx` | 16 iconos SVG en linea, `currentColor`, sin imagenes externas. |
| `DocEstadoChips.tsx` | Chips de estado como `radiogroup` accesible. |
| `DocRequisitoCard.tsx` | Tarjeta de requisito con observacion. |
| `DocProrroga.tsx` | Prorroga con dias restantes y aviso de vencimiento. |
| `DocTipoFuncionario.tsx` | Cuatro tarjetas de rama. |
| `DocGarantiaSelector.tsx` | Tipos 1, 2 y 3, con aviso antes de archivar. |
| `DocSelectorCatalogo.tsx` | Desplegable con busqueda, carga, error y reintento. |
| `doc-expediente.css` | Hoja de estilos del modulo, sobre las variables existentes. |
| `src/lib/doc/docExpediente.test.ts` | 54 pruebas. |

---

## 5. Hojas y columnas

### `Auxiliar` (nombre exacto)

Dos cabeceras: **`agencia_bdp`** y **`gerencia_bdp`**. El modulo lee todos los
valores no vacios debajo de cada una, recorta espacios, ignora filas vacias y
no devuelve duplicados.

`Auxiliar` **no** forma parte de `DOC_SCHEMA`, y es deliberado: el instalador
no debe recrearla ni tocar su contenido. Es una hoja que mantienen las
personas, no el codigo.

Hallazgos que reporta el diagnostico:

| Codigo | Significado |
|---|---|
| `AUX_SIN_HOJA` | No existe la hoja |
| `AUX_CABECERA_FALTA` | Falta una cabecera |
| `AUX_CABECERA_VARIANTE` | Existe con otra caja o con espacios invisibles |
| `AUX_CABECERA_DUPLICADA` | Aparece mas de una vez: ambiguo, no se repara solo |
| `AUX_CATALOGO_VACIO` | La cabecera existe pero no tiene valores |
| `AUX_VALORES_REPETIDOS` | Hay valores duplicados |
| `AUX_CATALOGO_ENORME` | Supera el limite razonable |

### Hojas del modulo

Se conserva el esquema fusionado en el PR #21 (`AUDITORIA`,
`ENTREGA COM+SEGUROS`, `CONTROL INGRESOS <anio>`, `_CATALOGO`, `_CONFIG`,
`_RESPALDOS`, `_DIARIO`, `_SOLICITUDES`, `_META`).

**Decision consciente:** no se migro al modelo normalizado de doce pestañas que
planteaba el encargo. Habria supuesto reescribir el backend recien fusionado y
mover datos existentes, que es justo lo que se pidio evitar. El catalogo
declarativo deja esa migracion preparada para hacerse despues por fases y con
respaldo, en vez de a ciegas y de golpe.

---

## 6. Funciones ejecutables

En el menu del libro:

| Entrada | Funcion |
|---|---|
| Instalar / actualizar | `docMenuInstalar` |
| Diagnosticar | `docMenuDiagnosticar` |
| Autorreparar | `docMenuAutoreparar` |
| **Validar catalogos (Auxiliar)** | `docMenuAuxiliar` |
| **Reparar catalogos (Auxiliar)** | `docMenuAuxiliarReparar` |
| Crear año | `docMenuCrearAnio` |
| Recalcular | `docMenuRecalcular` |
| Recolorear | `docMenuRecolorear` |
| Respaldar / ver respaldos | `docMenuRespaldar`, `docMenuVerRespaldos` |
| Duplicados / compactar | `docMenuDuplicados`, `docMenuCompactar` |
| Disparadores | `docInstalarDisparadores`, `docQuitarDisparadores` |
| Pruebas | `docMenuPruebas` |

La reparacion distingue lo **aplicado** de lo que queda **PENDIENTE** por ser
ambiguo. Nada ambiguo se repara solo.

---

## 7. Tutorial de actualizacion manual

1. **Respalde la hoja.** `Archivo › Crear una copia`. No siga sin esto.
2. **Abra el editor**: `Extensiones › Apps Script`.
3. **Cree el archivo `11_Auxiliar.gs`** y pegue su contenido desde
   `apps-script/documentacion/11_Auxiliar.gs`.
4. **Reemplace `08_Router.gs`** con la version de esta rama.
5. **Reemplace `09_Menu.gs`** con la version de esta rama.
6. **Guarde** todos los archivos (`Ctrl+S`).
7. **Ejecute `docMenuInstalar`** desde el editor. Es la primera funcion a
   ejecutar.
8. **Acepte los permisos.** Google pedira acceso a hojas de calculo y a
   servicios externos; es normal la primera vez.
9. **Recargue la hoja** para que aparezca el menu actualizado.
10. **Abra `Validar catalogos (Auxiliar)`.** Le dira si falta la hoja o alguna
    cabecera.
11. **Si falta algo, ejecute `Reparar catalogos (Auxiliar)`.** Crea la hoja y
    las cabeceras sin borrar valores.
12. **Cargue las agencias** debajo de `agencia_bdp`, una por fila.
13. **Cargue las gerencias** debajo de `gerencia_bdp`, una por fila.
14. **Vuelva a validar.** Debe salir sin hallazgos.
15. **Ejecute `docMenuDiagnosticar`** para revisar el resto del libro.
16. **Ejecute `docMenuAutoreparar`** solo si el diagnostico propuso algo.
17. **Compruebe el estilo** con `docMenuRecolorear`.
18. **Publique el frontend** (Vercel despliega solo al fusionar).
19. **Cree un expediente de prueba** y recorra las cuatro ramas.
20. **Para revertir:** vuelva a la copia del paso 1 y restaure la version
    anterior del script desde `Historial de versiones` del editor.

> Volver a ejecutar la instalacion es seguro: las operaciones son idempotentes
> y no duplican opciones ni cabeceras.

---

## 8. Plan de pruebas

### Automatizadas — `npm test`

54 pruebas en `src/lib/doc/docExpediente.test.ts`, con fecha fija para que no
cambien de resultado segun el dia:

| Bloque | Cubre |
|---|---|
| Catalogo | 18 generales, codigos unicos, N/A solo en 3, prorroga solo en 2, reparto por rama |
| Prorrogas | vigente / por vencer / vencida / invalida, dias con signo |
| Identificador | formato, guion tipografico, guiones internos del CI, rango de año, rechazos |
| Fechas | 30 de febrero, año bisiesto, fecha en palabras |
| Asistente | seis campos, paso de garantia solo en comercial, inmutabilidad, archivado al cambiar |
| Avance | N/A no penaliza, 0 %, 100 %, prorrogas vencidas |
| Exportacion | nombre de hoja, 31 caracteres, firma ZIP, formulas neutralizadas |

### Verificaciones ya realizadas

- `tsc` sobre todos los archivos nuevos: **sin errores**.
- Las 54 pruebas: **todas correctas**.
- `unzip -t` sobre un `.xlsx` generado: *"No errors detected"*.
- Los `.xlsx` abiertos con `zipfile` de Python: todas las partes XML parsean.

### Manuales pendientes

Crear expediente por cada rama, prorrogas, edicion, exportacion individual y
agrupada, y comportamiento en movil.

---

## 9. Riesgos y limites

### El asistente todavia no esta montado en la pantalla

**Es lo unico que falta y conviene decirlo sin rodeos.** Los componentes
existen, compilan y estan probados, pero `src/modules/Documentacion.tsx` sigue
abriendo el formulario anterior. Hasta que se enganche, la pantalla nueva no se
ve al navegar.

El enganche es pequeño y localizado:

```tsx
import { DocExpedienteWizard } from "../components/doc/DocExpedienteWizard";

<DocExpedienteWizard
  onGuardar={async (borrador, claveIdempotencia) => { /* persistir */ }}
  onCancelar={() => setAbierto(false)}
  identificadorExistente={(id) => existeEnLaLista(id)}
/>
```

No se hizo a ciegas por una razon concreta: `Documentacion.tsx` tiene unas 900
lineas y en este entorno no se puede ejecutar el build real. Editarlo sin poder
compilarlo es exactamente lo que dejo la pagina sin desplegar la vez anterior,
con un unico import sobrante. Se prefirio no repetirlo.

### Otros limites

| Limite | Detalle |
|---|---|
| Sin carga de archivos | Solo estados, observaciones, fechas y metadatos, como se pidio |
| Lote de exportacion | Tope de 500 expedientes salvo que se fuerce |
| `doc:check` | Puede listar `auxiliar.*` como no invocadas porque `docAuxiliar.ts` usa `llamarDoc` directamente. No lo ejecuta Vercel |
| Prorroga de `examen-uif` | `DOC_CATALOGO_SEMILLA` la marca como prorrogable y el catalogo nuevo no. Conviene decidirlo antes de migrar |

---

## 10. Checklist del PR

- [x] El despliegue vuelve a compilar
- [x] El trabajo del PR #21 se conserva entero
- [x] `Auxiliar` con `agencia_bdp` y `gerencia_bdp`
- [x] Seis campos generales en el orden pedido
- [x] 18 documentos generales en el orden pedido
- [x] Chips ENTREGADO / PENDIENTE / NO ENTREGADO, y N/A solo donde toca
- [x] Observaciones atadas al codigo estable del requisito
- [x] Las dos prorrogas acordadas
- [x] Comercial con tipos 1, 2 y 3 completos
- [x] Auditoria y Cumplimiento con sus requisitos
- [x] Ejecutivo o Directorio *En construccion*, sin poder guardar
- [x] Retroceder y editar sin perder datos
- [x] Borrador recuperable
- [x] Exportacion individual y agrupada
- [x] Accesibilidad por teclado y `prefers-reduced-motion`
- [x] Movil y escritorio
- [x] Diagnostico y reparacion
- [x] Clave de idempotencia contra el doble envio
- [ ] **Asistente montado en `Documentacion.tsx`** — pendiente
- [ ] Migracion al modelo normalizado de pestañas — deliberadamente aplazada

---

## 11. Mejoras adicionales

1. **Escritor de Excel propio.** Se descarto `fflate`, pese a estar en
   `package.json`, porque no se podia verificar su API sin `node_modules`. El
   escritor propio no añade peso ni dependencias.
2. **Inyeccion de formulas.** El `.xlsx` usa `inlineStr`, que Excel nunca
   evalua como formula. En CSV, donde si es un riesgo real, se antepone una
   comilla a `=`, `+`, `-` y `@`.
3. **Valores historicos.** Una agencia que ya no esta en el catalogo se muestra
   con aviso y **no se borra**.
4. **Cambio de garantia.** Avisa de cuantos requisitos se archivarian y espera
   confirmacion antes de tocar nada.
5. **Guion tipografico.** Se acepta el guion largo que aparece al pegar desde
   Word, en vez de rechazar el identificador sin explicar por que.
