import os
import re
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_socketio import SocketIO
from flask_cors import CORS
from shapely.geometry import Point, Polygon
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
#ARTURO
import pyodbc
from datetime import timedelta, datetime
import json



app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5000"])
app.config['SECRET_KEY'] = 'mi_clave_secreta_super_segura!'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)

import urllib

# --- DB CONFIG ---
params = urllib.parse.quote_plus(
    'DRIVER={ODBC Driver 17 for SQL Server};'
    'SERVER=R2-D2;' # <--- REEMPLAZA ESTO
    'DATABASE=GeofencingDB;'
    'Trusted_Connection=yes;'
)

app.config['SQLALCHEMY_DATABASE_URI'] = f"mssql+pyodbc:///?odbc_connect={params}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
socketio = SocketIO(app, cors_allowed_origins="*")
# --- ARTURO MODELOS ---
class User(db.Model):
    __tablename__ = 'Usuarios' 
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100))
    apellido_paterno = db.Column(db.String(100))
    apellido_materno = db.Column(db.String(100))
    telefono = db.Column(db.String(20))
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    devices = db.relationship('Device', backref='owner', lazy=True)

class Device(db.Model):
    __tablename__ = 'Dispositivos' 
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(50), unique=True, nullable=False)
    alias = db.Column(db.String(50), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('Usuarios.id'), nullable=False)

class Mapa(db.Model):
    __tablename__ = 'Mapas'
    id_mapa = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('Usuarios.id'), nullable=False)
    nombre_mapa = db.Column(db.String(100), nullable=False)
    fecha_creacion = db.Column(db.DateTime, default=datetime.now)
    geocercas = db.relationship('Geocerca', backref='mapa', lazy=True)

    @property
    def cantidad_geocercas(self):
        return len(self.geocercas)

class Geocerca(db.Model):
    __tablename__ = 'Geocercas' 
    id_geocerca = db.Column(db.Integer, primary_key=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('Usuarios.id'), nullable=False)
    id_mapa = db.Column(db.Integer, db.ForeignKey('Mapas.id_mapa'), nullable=True) # <--- NUEVO
    nombre_zona = db.Column(db.String(100), nullable=False)
    coordenadas_json = db.Column(db.Text, nullable=False)
    fecha_creacion = db.Column(db.DateTime, default=datetime.now)
    
    @property
    def cantidad_puntos(self):
        try:
            puntos_lista = json.loads(self.coordenadas_json)
            return len(puntos_lista)
        except:
            return 0
# --- ZONAS (GEOCERCAS) ---

# 1. Zonas Fijas
ZOCALO_POLYGON = Polygon([
    (-99.1352, 19.4340), (-99.1314, 19.4340), 
    (-99.1314, 19.4315), (-99.1352, 19.4315), 
])

ESIME_POLYGON = Polygon([
    (-99.1153, 19.3310), (-99.1103, 19.3310), 
    (-99.1103, 19.3260), (-99.1153, 19.3260), 
])

# 2. Zonas Dinámicas (Lista vacía al inicio)
# Aquí guardaremos múltiples polígonos
CUSTOM_ZONES = [] 

# --- RUTAS WEB ---
@app.route("/")
def home(): return render_template('login.html')

@app.route("/map")
def map(): return render_template('index.html')

# --- API: GESTIÓN DE ZONAS ---
@app.route("/api/clear_zones", methods=['POST'])
def clear_zones():
    # Reinicia la lista
    global CUSTOM_ZONES
    CUSTOM_ZONES = []
    print("🗑️ Todas las zonas personalizadas han sido borradas.")
    return jsonify({"message": "Zonas borradas"}), 200

# --- API: UBICACIÓN ---
@app.route("/api/update_location", methods=['POST'])
def update_location():
    data = request.get_json()
    device_id = data.get('device_id', 'unknown')
    
    # Nombre del dispositivo
    device_db = Device.query.filter_by(device_id=device_id).first()
    alias = device_db.alias if device_db else device_id
    
    try:
        user_location = Point(data['lng'], data['lat'])
        status = 'SAFE'
        message = 'Zona Segura (Monitoreando...)'

        # 1. Revisar Zonas Fijas
        if ZOCALO_POLYGON.contains(user_location):
            status = 'DANGER'
            message = f'¡ALERTA! {alias} en el ZÓCALO'
        elif ESIME_POLYGON.contains(user_location):
            status = 'WARNING'
            message = f'¡AVISO! {alias} en ESIME CULHUACÁN'
        
        # 2. Revisar Zonas Personalizadas (Bucle)
        else:
            # Recorremos la lista de zonas dibujadas
            for i, zone in enumerate(CUSTOM_ZONES):
                if zone.contains(user_location):
                    status = 'DANGER'
                    message = f'¡ALERTA! {alias} entró en ZONA DIBUJADA #{i+1}'
                    break # Si ya entró en una, dejamos de buscar

        # Emitir evento
        if status != 'SAFE': print(f">>> 🚨 {message}")
        socketio.emit('geofence_event', {'status': status, 'message': message})

    except Exception as e:
        print(f"Error geo: {e}")

    data['alias'] = alias
    socketio.emit('new_location', data)
    return jsonify({"status": "success"})

# --- ARTURO AUTH (Igual que antes) ---
@app.route("/api/register", methods=['POST'])
def register():
    data = request.get_json()
    
    # Verificamos si el correo ya existe
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"message": "El correo ya está registrado"}), 400
    
    # Encriptamos la contraseña por seguridad (Fundamental para titulación)
    hashed = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    
    # Creamos el nuevo usuario con todos los campos del formulario ancho
    new_user = User(
        nombre=data.get('nombre'),
        apellido_paterno=data.get('paterno'),
        apellido_materno=data.get('materno'),
        telefono=data.get('telefono'),
        email=data['email'],
        password=hashed
    )
    
    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"message": "Usuario creado correctamente"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error al registrar: {e}")
        return jsonify({"message": "Error interno del servidor"}), 500

@app.route("/api/login", methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data.get('email')).first()
    
    if user and bcrypt.check_password_hash(user.password, data.get('password')):
        # --- ESTO ES LO QUE FALTA PARA ACTIVAR EL MENÚ ---
        session.permanent = True
        session.modified = True 
        session['user_email'] = user.email
        session['user_name'] = f"{user.nombre} {user.apellido_paterno}"
        # -------------------------------------------------
        
        print(f" Sesión iniciada para: {session['user_name']}") # Ver en terminal
        return jsonify({"message": "Ok", "email": user.email}), 200
    
    return jsonify({"message": "Bad"}), 401


@app.route("/api/link_device", methods=['POST'])
def link_device():
    # (Usa el código anterior de link_device)
    return jsonify({"msg": "ok"}), 200

# Ruta Registro
@app.route('/register-view')
def register_view():
    return render_template('register_page.html')

@app.route("/logout")
def logout():
    return redirect(url_for('home'))

# ----- GUARDAR GEOCERCAS -----------
@app.route("/api/add_zone", methods=['POST'])
def add_zone():
    data = request.get_json()
    nombre = data.get('name')
    puntos = data.get('points')
    
    # --- CAMBIO 1: Recibir el ID del mapa desde JavaScript ---
    id_mapa_recibido = data.get('map_id') 
    
    user_email = session.get('user_email')

    if not user_email:
        return jsonify({"message": "Sesión no iniciada"}), 401

    import json
    try:
        # 1. Buscamos al usuario usando SQLAlchemy (igual que en tu login)
        user = User.query.filter_by(email=user_email).first()
        
        if not user:
            return jsonify({"message": "Usuario no encontrado"}), 404

        # 2. Creamos la nueva geocerca
        nueva_zona = Geocerca(
            id_usuario=user.id,
            id_mapa=id_mapa_recibido, # --- CAMBIO 2: Asignarla a su mapa de inmediato ---
            nombre_zona=nombre,
            coordenadas_json=json.dumps(puntos)
        )

        # 3. Guardamos en la base de datos R2-D2
        db.session.add(nueva_zona)
        db.session.commit()
        
        # Actualizamos tu print para que también te avise en qué mapa se guardó
        print(f"✅ Éxito: Geocerca '{nombre}' guardada en R2-D2 (Mapa ID: {id_mapa_recibido})")
        return jsonify({"message": "Ok"}), 200

    except Exception as e:
        db.session.rollback() # Por si algo falla, deshacemos el intento
        print(f"❌ Error en SQLAlchemy: {str(e)}")
        # Ahora el error real viajará hasta tu navegador
        return jsonify({"message": str(e)}), 500

# RUTA AL PERFIL 
@app.route("/profile")
def profile():
    user_email = session.get('user_email')
    user_name = session.get('user_name')

    if not user_email:
        return redirect(url_for('home'))

    user = User.query.filter_by(email=user_email).first()

    if user:
        mis_zonas = Geocerca.query.filter_by(id_usuario=user.id).all()
        # --- NUEVO: Consultamos los mapas ---
        mis_mapas = Mapa.query.filter_by(id_usuario=user.id).all() 
    else:
        mis_zonas = []
        mis_mapas = [] # Lista vacía si no hay

    return render_template('profile.html', 
                           email_html=user_email, 
                           nombre_html=user_name,
                           geocercas=mis_zonas,
                           mapas=mis_mapas) # Pasamos los mapas a la plantilla
# ----- ELIMINAR GEOCERCA -----------
@app.route("/api/delete_zone/<int:id_zona>", methods=['POST'])
def delete_zone(id_zona):
    # 1. Verificamos quién está pidiendo borrar
    user_email = session.get('user_email')
    if not user_email:
        return jsonify({"message": "Sesión no iniciada"}), 401

    try:
        # 2. Buscamos al usuario
        user = User.query.filter_by(email=user_email).first()
        
        # 3. Buscamos la geocerca. 
        # IMPORTANTE: Filtramos también por id_usuario por seguridad, 
        # para que nadie pueda borrar las zonas de otro usuario.
        zona = Geocerca.query.filter_by(id_geocerca=id_zona, id_usuario=user.id).first()
        
        if not zona:
            return jsonify({"message": "Geocerca no encontrada"}), 404

        # 4. Ejecutamos el DELETE en la base de datos
        db.session.delete(zona)
        db.session.commit()
        
        print(f"🗑️ Éxito: Geocerca ID {id_zona} eliminada de la base de datos.")
        return jsonify({"message": "Eliminada correctamente"}), 200

    except Exception as e:
        db.session.rollback() # Si algo falla, cancelamos la transacción
        print(f"❌ Error al eliminar: {str(e)}")
        return jsonify({"message": str(e)}), 500
    

# ----- RUTAS DE MAPAS (ARTURO) -----------
@app.route("/api/get_next_map_name", methods=['GET'])
def get_next_map_name():
    user_email = session.get('user_email')
    if not user_email:
        return jsonify({"error": "No auth"}), 401
        
    user = User.query.filter_by(email=user_email).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    # Contamos cuántos mapas tiene el usuario en la base de datos
    cantidad_mapas = Mapa.query.filter_by(id_usuario=user.id).count()
    siguiente_nombre = f"Mapa {cantidad_mapas + 1}"
    
    return jsonify({"nextName": siguiente_nombre}), 200


@app.route("/api/save_map", methods=['POST'])
def save_map():
    user_email = session.get('user_email')
    if not user_email:
        return jsonify({"message": "Sesión no iniciada"}), 401
        
    user = User.query.filter_by(email=user_email).first()
    if not user:
        return jsonify({"message": "Usuario no encontrado"}), 404

    data = request.get_json()
    map_id = data.get('map_id') # Viene null la primera vez, y con número las siguientes
    name = data.get('name')

    try:
        if not map_id:
            # 1. Crear nuevo mapa si no existía
            nuevo_mapa = Mapa(id_usuario=user.id, nombre_mapa=name)
            db.session.add(nuevo_mapa)
            db.session.flush() # Obtenemos el ID temporalmente antes del commit
            map_id = nuevo_mapa.id_mapa
        else:
            # 2. Actualizar el nombre si el mapa ya existía
            mapa_existente = Mapa.query.filter_by(id_mapa=map_id, id_usuario=user.id).first()
            if mapa_existente:
                mapa_existente.nombre_mapa = name

        # 3. La Magia: Buscar todas las geocercas sueltas de este usuario (id_mapa = None)
        # y vincularlas oficialmente a este mapa. 
        zonas_sueltas = Geocerca.query.filter_by(id_usuario=user.id, id_mapa=None).all()
        for zona in zonas_sueltas:
            zona.id_mapa = map_id

        # Guardamos todos los cambios juntos en SQL Server
        db.session.commit()
        return jsonify({"message": "Ok", "new_map_id": map_id}), 200

    except Exception as e:
        db.session.rollback()
        print(f"❌ Error al guardar el mapa: {str(e)}")
        return jsonify({"message": str(e)}), 500
    
@app.route("/api/get_map_zones/<int:id_mapa>", methods=['GET'])
def get_map_zones(id_mapa):
    import json # Aseguramos que json esté cargado
    
    user_email = session.get('user_email')
    if not user_email:
        return jsonify({"message": "No autorizado"}), 401
    
    user = User.query.filter_by(email=user_email).first()
    mapa = Mapa.query.filter_by(id_mapa=id_mapa, id_usuario=user.id).first()
    
    if not mapa:
        return jsonify({"message": "Mapa no encontrado"}), 404
    
    zonas_data = []
    # Sacamos todas las geocercas que pertenecen a este mapa
    for zona in mapa.geocercas:
        zonas_data.append({
            "nombre": zona.nombre_zona,
            "puntos": json.loads(zona.coordenadas_json)
        })
    
    return jsonify({
        "nombre_mapa": mapa.nombre_mapa,
        "zonas": zonas_data
    }), 200
# --- ESTO SIEMPRE DEBE IR HASTA EL FINAL DEL ARCHIVO ---
if __name__ == "__main__":
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
