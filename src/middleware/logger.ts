import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de logging para monitorear todas las peticiones HTTP
 * Registra: método, URL, parámetros, body, headers y tiempo de respuesta
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Capturar información de la petición
  const requestInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    params: req.params,
    body: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? '***TOKEN PRESENTE***' : 'Sin token',
      'user-agent': req.headers['user-agent'],
      'origin': req.headers.origin,
    },
    ip: req.ip || req.socket.remoteAddress,
  };

  // Log de la petición entrante
  console.log('\n' + '='.repeat(80));
  console.log('📥 PETICIÓN ENTRANTE');
  console.log('='.repeat(80));
  console.log(`🕐 Timestamp: ${requestInfo.timestamp}`);
  console.log(`📍 Método: ${requestInfo.method}`);
  console.log(`🔗 URL Completa: ${requestInfo.url}`);
  console.log(`📂 Path: ${requestInfo.path}`);
  
  if (Object.keys(requestInfo.query).length > 0) {
    console.log(`❓ Query Params:`, JSON.stringify(requestInfo.query, null, 2));
  }
  
  if (Object.keys(requestInfo.params).length > 0) {
    console.log(`🎯 Route Params:`, JSON.stringify(requestInfo.params, null, 2));
  }
  
  if (requestInfo.body && Object.keys(requestInfo.body).length > 0) {
    console.log(`📦 Body:`, JSON.stringify(requestInfo.body, null, 2));
  }
  
  console.log(`🔐 Auth: ${requestInfo.headers.authorization}`);
  console.log(`🌐 Origin: ${requestInfo.headers.origin || 'No especificado'}`);
  console.log(`💻 IP: ${requestInfo.ip}`);
  console.log('='.repeat(80));

  // Interceptar la respuesta para loggear el resultado
  const originalSend = res.send;
  res.send = function(data: any): Response {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('\n' + '-'.repeat(80));
    console.log('📤 RESPUESTA ENVIADA');
    console.log('-'.repeat(80));
    console.log(`📍 Endpoint: ${requestInfo.method} ${requestInfo.path}`);
    console.log(`⏱️  Duración: ${duration}ms`);
    console.log(`📊 Status Code: ${res.statusCode}`);
    
    // Mostrar un preview de la respuesta (limitado para no saturar la consola)
    try {
      const responsePreview = typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data).substring(0, 200);
      console.log(`📄 Response Preview: ${responsePreview}${responsePreview.length >= 200 ? '...' : ''}`);
    } catch (e) {
      console.log(`📄 Response: [No se pudo parsear]`);
    }
    
    console.log('-'.repeat(80) + '\n');
    
    return originalSend.call(this, data);
  };

  next();
};

/**
 * Middleware simplificado para logging básico (alternativa ligera)
 */
export const simpleLogger = (req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toLocaleString('es-ES');
  console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}`);
  next();
};
