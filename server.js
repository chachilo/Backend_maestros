const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');


const app = express();
app.use(cors());
app.use(express.json());

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Carpeta donde se guardarán los archivos
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Nombre único del archivo
    },
});

const upload = multer({ storage });

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
    user: 'datos_cv_user',
    host: 'dpg-cv29q8ij1k6c739aibr0-a',
    database: 'datos_cv',
    password: 'j7xPMXAuzRJ6dLL54PLtvmyr1CpQoD0m',
    port: 5432,
});

// Clave secreta para firmar los tokens JWT
const JWT_SECRET = 'tu_clave_secreta';

// Ruta para registrar un nuevo usuario (maestro)
app.post('/registrar', async (req, res) => {
    const { nombre_completo, email, password } = req.body;

    if (!nombre_completo || !email || !password) {
        return res.status(400).send('Todos los campos son obligatorios.');
    }

    try {
        // Verificar si el correo ya está registrado
        const userExists = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).send('El correo ya está registrado.');
        }

        // Encriptar la contraseña
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insertar el nuevo usuario en la base de datos
        const result = await pool.query(
            'INSERT INTO usuarios (nombre_completo, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
            [nombre_completo, email, passwordHash]
        );

        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al registrar el usuario.');
    }
});

const RECAPTCHA_SECRET_KEY = '6Ld_kOcqAAAAAALILq1G5pAZBqug3SyyAVGwIIBZ'; // Reemplaza con tu secret key

app.post('/login', async (req, res) => {
  const { email, password, recaptchaValue } = req.body;

  // Verificar el reCAPTCHA
  const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${recaptchaValue}`;

  try {
    const recaptchaResponse = await axios.post(verificationUrl);
    if (!recaptchaResponse.data.success) {
      return res.status(400).json({ message: 'reCAPTCHA verification failed' });
    }

    // Aquí puedes continuar con la lógica de autenticación
    // ...

    res.json({ token: 'fake-jwt-token' });
  } catch (error) {
    console.error('Error verifying reCAPTCHA:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Ruta para iniciar sesión
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send('Correo y contraseña son obligatorios.');
    }

    try {
        // Buscar el usuario por correo
        const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(400).send('Correo o contraseña incorrectos.');
        }

        // Verificar la contraseña
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(400).send('Correo o contraseña incorrectos.');
        }

        // Generar un token JWT
        const token = jwt.sign({ id: user.id, email: user.email, rol: user.rol }, JWT_SECRET, {
            expiresIn: '1h',  // El token expira en 1 hora
        });

        res.json({ success: true, token, user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al iniciar sesión.');
    }
});

// Ruta para obtener los detalles de un grupo
app.get('/grupos/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('SELECT * FROM grupos WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).send('Grupo no encontrado.');
        }
        res.json({ success: true, grupo: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener los detalles del grupo.');
    }
});

app.post('/guardar-asistencia', async (req, res) => {
    const { grupo_id, fecha, asistencia } = req.body;

    try {
        // Insertar cada asistencia en la base de datos
        for (const alumno_id in asistencia) {
            await db.query(
                'INSERT INTO asistencias (grupo_id, alumno_id, fecha, asistio) VALUES ($1, $2, $3, $4)',
                [grupo_id, alumno_id, fecha, asistencia[alumno_id]]
            );
        }

        res.status(200).json({ message: 'Asistencia guardada correctamente.' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Error al guardar la asistencia.' });
    }
});

// Ruta para obtener los alumnos de un grupo
app.get('/grupos/:id/alumnos', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('SELECT * FROM alumnos WHERE grupo_id = $1', [id]);
        res.json({ success: true, alumnos: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener los alumnos.');
    }
});

// Ruta para subir el CV de un profesor
app.post('/upload-cv', upload.single('cv'), async (req, res) => {
    const { profesor_id, cvData } = req.body; // cvData contiene toda la información del CV
    const cvFile = req.file;

    if (!cvFile) {
        return res.status(400).send('No se ha subido ningún archivo.');
    }

    try {
        // Guardar el CV en la tabla `cvs`
        const cvResult = await pool.query(
            'INSERT INTO cvs (profesor_id, nombre_archivo, url) VALUES ($1, $2, $3) RETURNING *',
            [profesor_id, cvFile.filename, `/uploads/${cvFile.filename}`]
        );

        // Guardar la información básica del profesor en la tabla `profesores`
        const { basicInfo, workExperience, education, skills, languages, certifications, publications, references } = JSON.parse(cvData);

        const profesorResult = await pool.query(
            'INSERT INTO profesores (nombre_completo, email, telefono, direccion, nacionalidad, linkedin, social_media, resumen_profesional) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [basicInfo.fullName, basicInfo.email, basicInfo.phone, basicInfo.address, basicInfo.nationality, basicInfo.linkedIn, JSON.stringify(basicInfo.socialMedia), basicInfo.professionalSummary]
        );

        const profesorId = profesorResult.rows[0].id;

        // Guardar la experiencia laboral en la tabla `experiencia_laboral`
        for (const exp of workExperience) {
            await pool.query(
                'INSERT INTO experiencia_laboral (profesor_id, institucion, puesto, fecha_inicio, fecha_fin, descripcion, logros, ubicacion) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [profesorId, exp.institucion, exp.puesto, exp.fecha_inicio, exp.fecha_fin, exp.descripcion, exp.logros, exp.ubicacion]
            );
        }

        // Guardar la educación en la tabla `educacion`
        for (const edu of education) {
            await pool.query(
                'INSERT INTO educacion (profesor_id, institucion, titulo, campo_estudio, fecha_inicio, fecha_fin) VALUES ($1, $2, $3, $4, $5, $6)',
                [profesorId, edu.institucion, edu.titulo, edu.campo_estudio, edu.fecha_inicio, edu.fecha_fin]
            );
        }

        // Guardar las habilidades en la tabla `habilidades`
        for (const skill of skills) {
            await pool.query(
                'INSERT INTO habilidades (profesor_id, nombre, tipo, nivel) VALUES ($1, $2, $3, $4)',
                [profesorId, skill.nombre, skill.tipo, skill.nivel]
            );
        }

        // Guardar los idiomas en la tabla `idiomas`
        for (const lang of languages) {
            await pool.query(
                'INSERT INTO idiomas (profesor_id, idioma, nivel, certificacion) VALUES ($1, $2, $3, $4)',
                [profesorId, lang.idioma, lang.nivel, lang.certificacion]
            );
        }

        // Guardar las certificaciones en la tabla `certificaciones`
        for (const cert of certifications) {
            await pool.query(
                'INSERT INTO certificaciones (profesor_id, nombre, institucion, fecha_obtencion, fecha_expiracion) VALUES ($1, $2, $3, $4, $5)',
                [profesorId, cert.nombre, cert.institucion, cert.fecha_obtencion, cert.fecha_expiracion]
            );
        }

        // Guardar las publicaciones en la tabla `publicaciones`
        for (const pub of publications) {
            await pool.query(
                'INSERT INTO publicaciones (profesor_id, titulo, descripcion, enlace) VALUES ($1, $2, $3, $4)',
                [profesorId, pub.titulo, pub.descripcion, pub.enlace]
            );
        }

        // Guardar las referencias en la tabla `referencias`
        for (const ref of references) {
            await pool.query(
                'INSERT INTO referencias (profesor_id, nombre, puesto, institucion, email, telefono, relacion) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [profesorId, ref.nombre, ref.puesto, ref.institucion, ref.email, ref.telefono, ref.relacion]
            );
        }

        res.json({ success: true, message: 'CV y datos guardados correctamente.' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al subir el CV y guardar los datos.');
    }
});

// Servir archivos estáticos (para acceder a los CVs subidos)
app.use('/uploads', express.static('uploads'));

// Ruta para crear un nuevo grupo
app.post('/crear-grupo', async (req, res) => {
    const { nombre } = req.body;

    if (!nombre) {
        return res.status(400).send('El nombre del grupo es obligatorio.');
    }

    try {
        const result = await pool.query(
            'INSERT INTO grupos (nombre) VALUES ($1) RETURNING *',
            [nombre]
        );
        res.json({ success: true, grupo: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al crear el grupo.');
    }
});

// Ruta para obtener todos los grupos
app.get('/grupos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM grupos');
        res.json({ success: true, grupos: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener los grupos.');
    }
});

// Ruta para agregar un alumno a un grupo
app.post('/agregar-alumno', async (req, res) => {
    const { grupo_id, nombre, numero_control } = req.body;

    if (!grupo_id || !nombre || !numero_control) {
        return res.status(400).send('Todos los campos son obligatorios.');
    }

    try {
        const result = await pool.query(
            'INSERT INTO alumnos (grupo_id, nombre, numero_control) VALUES ($1, $2, $3) RETURNING *',
            [grupo_id, nombre, numero_control]
        );
        res.json({ success: true, alumno: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al agregar el alumno.');
    }
});

// Ruta para obtener los alumnos de un grupo
app.get('/grupos/:id/alumnos', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('SELECT * FROM alumnos WHERE grupo_id = $1', [id]);
        res.json({ success: true, alumnos: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al obtener los alumnos.');
    }
});

// Iniciar el servidor
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
