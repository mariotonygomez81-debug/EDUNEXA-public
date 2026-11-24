# Borrador SQL: autorización contextual ligada al rol

- Estado: **borrador no ejecutable; requiere baseline y validación PostgreSQL local**
- Rama: `feature/tutor-module`
- Propósito: corregir composición de permisos en helpers de ámbito.
- No es una migración versionada. No aplicar en Supabase hosted.
- Referencias de implementación: migraciones `20261120035955`, `20261121012945`, `20261121194020`, `20261121194543`, `20261122004307`.

## 1. Contrato

`has_institution_permission(institution, permission)` conserva permisos acumulativos entre roles de una membresía activa.

En cambio, los helpers contextuales deben unir `membership_roles -> roles -> role_permissions -> permissions` y evaluar ámbito y permiso dentro de la misma fila de rol. No deben invocar el helper institucional como prueba de permiso para una rama de rol.

El borrador cubre cuatro funciones porque `can_manage_course_subject` repite el mismo patrón y protege calificación por asignatura. Corregir sólo las tres funciones solicitadas dejaría una vía equivalente.

## 2. Fragmento de cambio central

En cada helper contextual, el FROM debe incluir:

```sql
join public.role_permissions rp on rp.role_id = r.id
join public.permissions p
  on p.id = rp.permission_id
 and p.key = p_permission_key
```

Y se debe quitar:

```sql
and private.has_institution_permission(p_institution_id, p_permission_key)
```

La fila de rol que cumple el ámbito queda así ligada al permiso solicitado. El resto de condiciones de membresía, institución, asignación, matrícula y relación debe mantenerse.

## 3. Definiciones que debe incorporar la futura migración

### 3.1 can_access_student

Partir de la definición vigente en `20261120035955_enable_scoped_academic_access.sql`. Mantener las ramas actuales:

- `institution_admin`, `administrative`, `director`;
- `teacher`, `prefect` con asignación y matrícula activas;
- `guardian` con relación explícita y flags `can_view_grades` / `can_view_attendance`;
- `student` con su propia relación `student_memberships`.

Cambiar únicamente el control de permiso por el JOIN central del §2, ligado a `r.id`. No ampliar las claves de rol ni las excepciones.

### 3.2 can_access_classroom

Partir de la última definición de `20261121012945_match_classroom_role_and_enrollment_scope.sql`, teniendo en cuenta la restricción posterior de `20261122004307_institution_admin_classroom_read_only.sql`.

Conservar la matriz contextual:

| Rol | Permisos contextuales permitidos |
|---|---|
| `institution_admin` | `classroom.read` |
| `director` | `classroom.read` |
| `teacher` | `classroom.read`, `classroom.manage`, `classroom.grade` |
| `student` | `classroom.read`, `classroom.submit` |
| `guardian` | `classroom.read` |

Además del JOIN del §2, mantener:
- docente con `assignment_type='teacher'`, asignación vigente y coincidencia exacta de división/asignatura;
- alumno con matrícula vigente y fechas válidas;
- tutor con vínculo y matrícula vigentes;
- institución y membresía activas.

La matriz anterior refleja las restricciones encontradas en las migraciones consultadas; debe contrastarse con el catálogo fundacional recuperado antes de aprobarla.

### 3.3 can_manage_division

Partir de la última definición de `20261121194543_enforce_teacher_division_and_subject_grade_scope.sql`. Sustituir la consulta global de permiso por el JOIN del §2. Mantener:

- bypass únicamente para `institution_admin`, condicionado al permiso que ese rol tenga asignado;
- `teacher` / `prefect` con `assignment_type = r.key`, división exacta y fechas vigentes.

### 3.4 can_manage_course_subject

Partir de la definición del mismo archivo. Sustituir la consulta global por el JOIN del §2. Mantener:

- `institution_admin` sólo si ese rol posee el permiso;
- `teacher` con asignación docente a la división y asignatura exactas (o asignación de división completa cuando `course_subject_id IS NULL));
- coincidencia institucional entre división y asignatura.

No cambiar las políticas RLS consumidoras en esta corrección salvo que las pruebas revelen un defecto adicional.

## 4. Grants y seguridad de funciones

Cada definición debe conservar:

- `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`;
- nombres de esquema totalmente calificados;
- validación de `auth.uid()` y membresía activa dentro del cuerpo;
- `REVOKE ALL ... FROM PUBLIC, anon`;
- `GRANT EXECUTE ... TO authenticated`.

No conceder ejecución a `anon` ni a `PUBLIC`. No mover helpers a `public`.

`has_institution_permission` permanece sin cambios: su contrato es acumulativo y útil para operaciones institucionales sin ámbito por rol.

## 5. Pruebas negativas necesarias

Las pruebas se deben ejecutar en Supabase local completo, bajo roles/JWT reales y con RLS activa. No usar mocks de Auth como única evidencia.

1. **Unión institucional:** usuario con dos roles; sólo uno posee `students.read`. `has_institution_permission` debe devolver true.
2. **No composición en estudiante:** el rol guardian aporta vínculo al estudiante A; un rol teacher distinto posee `students.read`, pero no tiene asignación a A. `can_access_student(A,...,'students.read')` debe devolver false.
3. **Permiso guardian del mismo rol:** guardian tiene vínculo A y permiso correspondiente en su propia fila de rol. Debe permitir sólo si el flag individual requerido también está habilitado.
4. **No composición en aula:** teacher aporta asignación al aula A; un rol distinto posee `classroom.grade`. `can_access_classroom(A,...,'classroom.grade')` debe devolver false.
5. **Teacher positivo:** teacher posee `classroom.grade` y asignación vigente exacta. Debe devolver true.
6. **No composición en división:** teacher aporta asignación a división A y otro rol aporta `grades.manage`. `can_manage_division(A,...,'grades.manage')` debe devolver false.
7. **No composición por asignatura:** teacher aporta asignación a división/asignatura A y otro rol aporta `grades.manage`. `can_manage_course_subject(A,...)` debe devolver false.
8. **Positivo de administrador:** `institution_admin` posee el permiso solicitado. Debe permitir sólo las capacidades explícitas del helper.
9. **Membresía suspendida:** todos los helpers contextuales devuelven false aunque exista permiso asignado.
10. **Institución cruzada:** permiso de institución A no autoriza ámbito de B.
11. **Asignación vencida:** un rol con permiso pero asignación vencida no accede.
12. **Matrícula vencida:** alumno/tutor no accede al aula por matrícula terminada.
13. **Regresión de tutor:** `can_view_grades=false` y `can_view_attendance=false` continúan bloqueando sus datos.
14. **Grants:** anon/PUBLIC no ejecutan; authenticated puede invocar el helper privado a través de las políticas/RPC autorizadas.
15. **RLS directo y RPC:** repetir negativos sobre lectura directa de tablas y RPCs, no sólo llamar a los helpers desde un contexto privilegiado.

## 6. Defecto histórico assigned_cs

La migración `20261120042419_define_scoped_classroom_capabilities.sql` referencia `assigned_cs.id` en el cuerpo SQL de `can_access_classroom` sin declarar ese alias. La validación estática CI actual revisa sólo `20261121012945`, por lo que no detecta el problema.

Antes de crear la migración correctiva:
1. reproducir la creación de esa función con PostgreSQL 16 y `check_function_bodies=on`;
2. registrar el error exacto de PostgreSQL;
3. decidir la reparación de la secuencia histórica.

Si se confirma que falla al crear la función, una migración posterior no puede rescatar una instalación limpia que ya se detuvo. La corrección de esa migración histórica debe decidirse conociendo el estado de aplicación de cada entorno y la política de checksums/historial; no reescribirla a ciegas ni tocar hosted. Como mínimo, el CI debe agregar un test de compilación de ese cuerpo SQL con el esquema mínimo y una prueba de replay ordenado.

## 7. Bloqueos de ejecución

No se dispone de Docker, Supabase CLI ni `psql` en el entorno local de esta sesión. El repositorio tampoco contiene un baseline fundacional autoritativo de las ocho tablas. Por lo tanto:

- no crear todavía un archivo en `supabase/migrations/`;
- no inventar un timestamp de migración (el skill de Supabase exige generar el archivo con `supabase migration new`);
- no afirmar que las funciones compilan;
- no ejecutar DDL contra Supabase hosted;
- no modificar Render ni desplegar.

Cuando exista baseline schema-only/DDL aprobado y PostgreSQL local, aplicar este borrador en una base desechable, ejecutar §5 y comprobar el replay completo. Sólo entonces convertirlo en migración real y agregar pruebas al CI.
