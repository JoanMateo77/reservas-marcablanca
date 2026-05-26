/**
 * prisma/seed-usuarios.ts — Usuarios de PRUEBA para QA / demos.
 *
 * Crea cuentas con las que SÍ se puede iniciar sesión (con passwordHash real),
 * respetando las reglas del sistema:
 *   - Correo institucional @uao.edu.co (auth.schema.ts)
 *   - Contraseña >=8, con mayúscula y carácter especial
 *   - El ROL se deriva de la lista blanca (igual que /api/auth/register y el login):
 *       correo en lista_blanca -> SECRETARIA, si no -> DOCENTE
 *
 * Es idempotente: usa upsert por correo, así que puedes correrlo varias veces
 * sin duplicar. Actualiza contraseña, rol y facultad en cada corrida.
 *
 * Uso:
 *   npx tsx prisma/seed-usuarios.ts
 *   (o)  npm run db:seed:users
 *
 * Requiere que las facultades y la lista blanca ya existan
 * (corre antes `npm run db:seed` si la BD está vacía).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Contraseña única para todos los usuarios de prueba.
// Cumple: >=8 caracteres, 1 mayúscula (P), 1 carácter especial (*).
const PASSWORD_PRUEBA = 'Prueba2026*';

// Nombres EXACTOS de las facultades creadas por prisma/seed.ts
const F = {
  ING: 'Facultad de Ingeniería y Ciencias Básicas',
  ECO: 'Facultad de Ciencias Económicas y Administrativas',
  COM: 'Facultad de Comunicación y Ciencias Sociales',
  HUM: 'Facultad de Humanidades y Artes',
  SOS: 'Instituto de Estudios para la Sostenibilidad',
} as const;

type UsuarioSeed = { nombre: string; correo: string; facultad: string };

// SECRETARIAS — sus correos coinciden con la lista blanca de seed.ts,
// por lo que el rol calculado será SECRETARIA.
const SECRETARIAS: UsuarioSeed[] = [
  { nombre: 'Secretaría Ingeniería',     correo: 'secretaria.ingenieria@uao.edu.co',     facultad: F.ING },
  { nombre: 'Secretaría Económicas',     correo: 'secretaria.economicas@uao.edu.co',     facultad: F.ECO },
  { nombre: 'Secretaría Comunicación',   correo: 'secretaria.comunicacion@uao.edu.co',   facultad: F.COM },
  { nombre: 'Secretaría Humanidades',    correo: 'secretaria.humanidades@uao.edu.co',    facultad: F.HUM },
  { nombre: 'Secretaría Sostenibilidad', correo: 'secretaria.sostenibilidad@uao.edu.co', facultad: F.SOS },
];

// DOCENTES — correos NO presentes en lista blanca => rol DOCENTE.
// Se incluyen dos docentes en Ingeniería para probar el aislamiento
// "cada docente ve solo SUS reservas" y los choques de horario (R-03).
const DOCENTES: UsuarioSeed[] = [
  { nombre: 'Carlos Docente Ingeniería',  correo: 'docente.ingenieria@uao.edu.co',     facultad: F.ING },
  { nombre: 'Ana Docente Ingeniería',     correo: 'docente2.ingenieria@uao.edu.co',    facultad: F.ING },
  { nombre: 'Luis Docente Económicas',    correo: 'docente.economicas@uao.edu.co',     facultad: F.ECO },
  { nombre: 'Sofía Docente Comunicación', correo: 'docente.comunicacion@uao.edu.co',   facultad: F.COM },
  { nombre: 'Jorge Docente Humanidades',  correo: 'docente.humanidades@uao.edu.co',    facultad: F.HUM },
  { nombre: 'Elena Docente Sostenib.',    correo: 'docente.sostenibilidad@uao.edu.co', facultad: F.SOS },
];

async function main() {
  console.log('👤 Seed de usuarios de prueba...\n');

  // Mapa nombre-facultad -> id (deben existir; si no, avisar)
  const facultades = await prisma.facultad.findMany({ select: { id: true, nombre: true } });
  const facId = new Map(facultades.map((f) => [f.nombre, f.id]));
  for (const nombre of Object.values(F)) {
    if (!facId.has(nombre)) {
      throw new Error(
        `Falta la facultad "${nombre}". Corre primero: npm run db:seed`
      );
    }
  }

  const passwordHash = await bcrypt.hash(PASSWORD_PRUEBA, 12);
  const todos = [...SECRETARIAS, ...DOCENTES];

  for (const u of todos) {
    // Rol derivado de lista blanca, igual que register/login
    const enListaBlanca = await prisma.listaBlanca.findUnique({
      where: { correoInstitucional: u.correo },
    });
    const rol = enListaBlanca ? 'SECRETARIA' : 'DOCENTE';
    const facultadId = facId.get(u.facultad)!;

    await prisma.usuario.upsert({
      where: { correoInstitucional: u.correo },
      update: { nombre: u.nombre, passwordHash, rol, facultadId, activo: true },
      create: {
        nombre: u.nombre,
        correoInstitucional: u.correo,
        passwordHash,
        rol,
        facultadId,
        activo: true,
      },
    });
    console.log(`  ✔ ${rol.padEnd(10)} ${u.correo}`);
  }

  console.log(
    `\n✅ ${todos.length} usuarios de prueba listos. Contraseña para todos: ${PASSWORD_PRUEBA}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
