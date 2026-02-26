import os
import re
from flask import Flask, request, jsonify, render_template, redirect, url_for
from flask_socketio import SocketIO
from flask_cors import CORS
from shapely.geometry import Point, Polygon
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
#ARTURO
import pyodbc

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = 'mi_clave_secreta_super_segura!'

import urllib

# --- DB CONFIG ---
# TIP: El nombre del servidor lo sacas de la ventana de inicio de SSMS 
# (ej: DESKTOP-XXXX\SQLEXPRESS)
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
    __tablename__ = 'Usuarios' # Asegúrate de que coincida con tu tabla en SQL Server
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

@app.route("/dashboard")
def dashboard(): return render_template('index.html')

# --- API: GESTIÓN DE ZONAS ---

@app.route("/api/add_zone", methods=['POST'])
def add_zone():
    # Agrega una nueva zona a la lista (sin borrar las anteriores)
    data = request.get_json()
    points = data.get('points') 
    
    if not points or len(points) < 3:
        return jsonify({"message": "Faltan puntos"}), 400

    try:
        coords = [(p['lng'], p['lat']) for p in points]
        new_poly = Polygon(coords)
        CUSTOM_ZONES.append(new_poly) # <--- AQUÍ ESTÁ LA MAGIA (APPEND)
        
        print(f"📐 Zona #{len(CUSTOM_ZONES)} agregada. Total zonas personalizadas: {len(CUSTOM_ZONES)}")
        return jsonify({"message": f"Zona {len(CUSTOM_ZONES)} agregada correctamente"}), 200
    except Exception as e:
        return jsonify({"message": "Error al procesar"}), 500

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
        return jsonify({"message": "Ok", "email": user.email}), 200
    return jsonify({"message": "Bad"}), 401

@app.route("/api/link_device", methods=['POST'])
def link_device():
    # (Usa el código anterior de link_device)
    return jsonify({"msg": "ok"}), 200

#Ruta Registro
@app.route('/register-view')
def register_view():
    return render_template('register_page.html')

#RUTA AL PERFIL
@app.route("/profile")
def profile():
    return render_template('profile.html')

@app.route("/logout")
def logout():
    return redirect(url_for('home'))

if __name__ == "__main__":
    #with app.app_context(): db.create_all()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)