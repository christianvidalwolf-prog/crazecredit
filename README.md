# Craze Credit - Financial & Risk Dashboard

Este proyecto es una aplicación experta de gestión financiera y de riesgos diseñada para consolidar datos de múltiples fuentes de ERP (Business Central / Navision) y proveedores de riesgo (Risk Portfolio).

## 🚀 Características

- **Diseño Premium**: Interfaz moderna en modo oscuro inspirada en "DEbt Hunter".
- **Consolidación Automática**: Script de procesamiento que cruza datos de Clientes, Movimientos, Cartera de Riesgo y Límites.
- **Módulos de Negocio**:
    - **Gestión de Límites**: Alertas de renovaciones próximas y propuestas de ampliación.
    - **Control de Riesgo**: Auditoría de discrepancias entre el sistema interno y el seguro de crédito.
    - **Análisis Comercial**: Visión de riesgo por comercial y panel de gestión de cobros.

## 🛠️ Estructura del Proyecto

```text
├── Customers (2).xlsx         # Datos maestros de clientes
├── Customer Ledger... .xlsx   # Movimientos de diario (facturas)
├── RISK_PORTFOLIO... .xlsx    # Coberturas de riesgo externo
├── Default... .xlsx           # Límites en el sistema interno (BC)
├── process_data.py            # Script de procesamiento (Python)
├── data.js                    # Datos procesados para el frontend
├── index.html                 # Interfaz de usuario principal
├── style.css                  # Estilos del dashboard
└── app.js                     # Lógica de la aplicación frontend
```

## 📋 Requisitos

- Python 3.9+
- Librería `pandas` y `openpyxl` para el procesamiento inicial.

## 🖥️ Cómo empezar

1. **Procesar los Datos**:
   Si actualizas los archivos Excel, ejecuta el script para regenerar la base de datos del dashboard:
   ```bash
   python3 process_data.py
   ```

2. **Visualizar el Dashboard**:
   Simplemente abre el archivo `index.html` en cualquier navegador moderno.

## ✒️ Autor
Proyecto desarrollado por **Christian Vidal Wolf**.
