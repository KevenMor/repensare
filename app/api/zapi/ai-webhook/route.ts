import { NextRequest, NextResponse } from 'next/server'
import { adminDB } from '@/lib/firebaseAdmin'
import { downloadAndSaveMedia, isFirebaseStorageUrl } from '@/lib/mediaStorage'

interface ZAPIWebhookEvent {
  event?: string
  instanceId?: string
  data?: any
  // Estrutura para mensagens
  messageId?: string
  phone?: string
  fromMe?: boolean
  momment?: number
  status?: string
  chatName?: string
  senderPhoto?: string
  senderName?: string
  participantPhone?: string
  photo?: string
  broadcast?: boolean
  type?: string
  text?: {
    message: string
  }
  image?: {
    caption?: string
    imageUrl: string
    thumbnailUrl: string
    mimeType: string
  }
  audio?: {
    audioUrl: string
    mimeType: string
  }
  video?: {
    caption?: string
    videoUrl: string
    mimeType: string
  }
  contact?: {
    displayName: string
    vcard: string
  }
  location?: {
    latitude: number
    longitude: number
    address?: string
    url?: string
  }
  document?: {
    documentUrl: string
    mimeType: string
    title: string
    pageCount?: number
  }
}

interface AdminConfig {
  zapiApiKey: string
  zapiInstanceId: string
  zapiBaseUrl: string
  openaiApiKey: string
  openaiModel: string
  openaiTemperature: number
  openaiMaxTokens: number
  systemPrompt: string
  welcomeMessage: string
  fallbackMessage: string
  handoffMessage: string
  webhookUrls: {
    leadCapture: string
    appointmentBooking: string
    paymentProcess: string
    supportTicket: string
    humanHandoff: string
  }
  zapiClientToken?: string
  // Novos campos para delay humanizado
  responseDelayMin: number
  responseDelayMax: number
  responseDelaySeconds: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('=== WEBHOOK Z-API RECEBIDO ===')
    console.log('Body completo:', JSON.stringify(body, null, 2))

    // Trava de segurança #1: Ignorar eventos gerados pelo próprio bot.
    if (body.fromMe === true) {
      console.log('Loop Prevention: Ignorando evento originado pelo bot (fromMe: true)')
      return NextResponse.json({ status: 'ignored', reason: 'fromMe is true' })
    }

    const event = body.event // ex: 'qrcode-updated'
    const type = body.type   // ex: 'ReceivedCallback', 'DeliveryCallback'

    console.log(`Webhook recebido. Event: ${event}, Type: ${type}`)

    if (event === 'qrcode-updated') {
      return handleQRCodeUpdate(body)
    }

    if (event === 'connection-update') {
      return handleConnectionUpdate(body)
    }
    
    // Processar mensagens recebidas de usuários (texto e mídia)
    if (type === 'ReceivedCallback') {
      console.log('Processando mensagem REAL do usuário com ID:', body.messageId)
      console.log('Tipo de conteúdo:', {
        hasText: !!body.text?.message,
        hasImage: !!body.image,
        hasAudio: !!body.audio,
        hasVideo: !!body.video,
        hasDocument: !!body.document,
        hasContact: !!body.contact,
        hasLocation: !!body.location
      })
      return handleMessage(body)
    }

    // Processar status de entrega de mensagens
    if (type === 'DeliveryCallback') {
      console.log('Status de entrega recebido:', body)
      return handleDeliveryStatus(body)
    }

    // Processar status de leitura de mensagens
    if (type === 'ReadCallback') {
      console.log('Status de leitura recebido:', body)
      return handleReadStatus(body)
    }

    // Ignorar todos os outros tipos de callbacks e eventos não tratados
    console.log(`Evento ignorado (não é uma mensagem de usuário). Event: ${event}, Type: ${type}`)
    return NextResponse.json({ 
      status: 'ignored', 
      reason: `Event type ${event || type} is not a processable user message` 
    })

  } catch (error) {
    console.error('Erro no webhook Z-API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    )
  }
}

async function handleQRCodeUpdate(body: any) {
  console.log('QR Code atualizado:', body)
  
  try {
    // Salvar QR Code no Firebase
    await adminDB.collection('admin_config').doc('ai_settings').update({
      qrCodeUrl: body.qrcode || body.data?.qrcode || '',
      connectionStatus: 'qr_code',
      lastConnection: new Date().toISOString()
    })
    
    console.log('QR Code salvo no Firebase')
  } catch (error) {
    console.error('Erro ao salvar QR Code:', error)
  }

  return NextResponse.json({ status: 'qr_code_updated' })
}

async function handleConnectionUpdate(body: any) {
  console.log('Status de conexão atualizado:', body)
  
  try {
    const status = body.state || body.data?.state || 'unknown'
    
    await adminDB.collection('admin_config').doc('ai_settings').update({
      connectionStatus: status,
      lastConnection: new Date().toISOString()
    })
    
    console.log('Status de conexão salvo:', status)
  } catch (error) {
    console.error('Erro ao salvar status de conexão:', error)
  }

  return NextResponse.json({ status: 'connection_updated' })
}

async function handleMessageStatus(body: any) {
  console.log('Status da mensagem:', body)
  // Aqui você pode implementar lógica para rastrear status de entrega
  return NextResponse.json({ status: 'message_status_received' })
}

async function handleMessage(message: ZAPIWebhookEvent) {
  try {
    console.log('=== PROCESSANDO MENSAGEM Z-API ===')
    console.log('Message ID:', message.messageId)
    console.log('Phone:', message.phone)
    console.log('From Me:', message.fromMe)
    console.log('Type:', message.type)
    console.log('Moment:', message.momment)

    // Validações básicas
    if (!message.phone) {
      console.error('Erro: Phone não fornecido na mensagem')
      return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
    }

    if (!message.messageId) {
      console.error('Erro: Message ID não fornecido')
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 })
    }

    // Obter configurações da IA do Firebase
    const configDoc = await adminDB.collection('admin_config').doc('ai_settings').get()
    if (!configDoc.exists) {
      console.error('Configurações da IA não encontradas')
      return NextResponse.json({ error: 'AI settings not configured' }, { status: 500 })
    }

    const config = configDoc.data()!

    // Processar diferentes tipos de conteúdo com validação robusta
    let userMessage = ''
    let mediaInfo = null

    // Identificar tipo de conteúdo e extrair informações com validação
    if (message.text?.message) {
      userMessage = message.text.message.trim()
      console.log('Mensagem de texto:', userMessage)
    } else if (message.image) {
      userMessage = `📷 Imagem enviada${message.image.caption ? `: ${message.image.caption}` : ''}`
      
      // FLUXO OBRIGATÓRIO: Download e salvamento no Firebase Storage
      let storageUrl = message.image.imageUrl
      if (message.image.imageUrl && !isFirebaseStorageUrl(message.image.imageUrl)) {
        console.log('Download e salvamento de imagem no Firebase Storage...')
        const storageResult = await downloadAndSaveMedia(
          message.image.imageUrl,
          'image',
          `image_${Date.now()}.jpg`
        )
        
        if (storageResult.success) {
          storageUrl = storageResult.publicUrl!
          console.log('Imagem salva no Storage:', storageUrl)
        } else {
          console.error('Erro ao salvar imagem no Storage:', storageResult.error)
          // Usar URL original como fallback
          storageUrl = message.image.imageUrl
        }
      }
      
      mediaInfo = {
        type: 'image',
        url: storageUrl,
        caption: message.image.caption,
        mimeType: message.image.mimeType
      }
    } else if (message.audio) {
      userMessage = '🎵 Áudio'
      
      // FLUXO OBRIGATÓRIO: Download e salvamento no Firebase Storage
      let storageUrl = message.audio.audioUrl
      if (message.audio.audioUrl && !isFirebaseStorageUrl(message.audio.audioUrl)) {
        console.log('Download e salvamento de áudio no Firebase Storage...')
        const storageResult = await downloadAndSaveMedia(
          message.audio.audioUrl,
          'audio',
          `audio_${Date.now()}.mp3`
        )
        
        if (storageResult.success) {
          storageUrl = storageResult.publicUrl!
          console.log('Áudio salvo no Storage:', storageUrl)
        } else {
          console.error('Erro ao salvar áudio no Storage:', storageResult.error)
          // Usar URL original como fallback
          storageUrl = message.audio.audioUrl
        }
      }
      
      mediaInfo = {
        type: 'audio',
        url: storageUrl,
        mimeType: message.audio.mimeType
      }
    } else if (message.video) {
      userMessage = `🎬 Vídeo${message.video.caption ? `: ${message.video.caption}` : ''}`
      
      // FLUXO OBRIGATÓRIO: Download e salvamento no Firebase Storage
      let storageUrl = message.video.videoUrl
      if (message.video.videoUrl && !isFirebaseStorageUrl(message.video.videoUrl)) {
        console.log('Download e salvamento de vídeo no Firebase Storage...')
        const storageResult = await downloadAndSaveMedia(
          message.video.videoUrl,
          'video',
          `video_${Date.now()}.mp4`
        )
        
        if (storageResult.success) {
          storageUrl = storageResult.publicUrl!
          console.log('Vídeo salvo no Storage:', storageUrl)
        } else {
          console.error('Erro ao salvar vídeo no Storage:', storageResult.error)
          // Usar URL original como fallback
          storageUrl = message.video.videoUrl
        }
      }
      
      mediaInfo = {
        type: 'video',
        url: storageUrl,
        caption: message.video.caption,
        mimeType: message.video.mimeType
      }
    } else if (message.document) {
      userMessage = `📄 ${message.document.title || 'Documento'}`
      
      // FLUXO OBRIGATÓRIO: Download e salvamento no Firebase Storage
      let storageUrl = message.document.documentUrl
      if (message.document.documentUrl && !isFirebaseStorageUrl(message.document.documentUrl)) {
        console.log('Download e salvamento de documento no Firebase Storage...')
        const storageResult = await downloadAndSaveMedia(
          message.document.documentUrl,
          'document',
          message.document.title || `document_${Date.now()}.pdf`
        )
        
        if (storageResult.success) {
          storageUrl = storageResult.publicUrl!
          console.log('Documento salvo no Storage:', storageUrl)
        } else {
          console.error('Erro ao salvar documento no Storage:', storageResult.error)
          // Usar URL original como fallback
          storageUrl = message.document.documentUrl
        }
      }
      
      mediaInfo = {
        type: 'document',
        url: storageUrl,
        title: message.document.title,
        mimeType: message.document.mimeType,
        pageCount: message.document.pageCount
      }
    } else if (message.contact) {
      userMessage = `👤 ${message.contact.displayName}`
      mediaInfo = {
        type: 'contact',
        displayName: message.contact.displayName,
        vcard: message.contact.vcard
      }
    } else if (message.location) {
      userMessage = `📍 ${message.location.address || 'Localização'}`
      mediaInfo = {
        type: 'location',
        latitude: message.location.latitude,
        longitude: message.location.longitude,
        address: message.location.address,
        url: message.location.url
      }
    } else {
      console.log('Tipo de mensagem não suportado:', message)
      await sendMessage(config, message.phone!, config.fallbackMessage)
      return NextResponse.json({ status: 'processed', response: 'fallback sent' })
    }

    const userPhone = message.phone!
    const userName = message.senderName || message.chatName || 'Cliente'

    console.log(`Processando mensagem de ${userName} (${userPhone}): ${userMessage}`)

    // Verificar se a mensagem já foi processada (evitar duplicatas)
    const conversationRef = adminDB.collection('conversations').doc(userPhone)
    const messagesRef = conversationRef.collection('messages')
    
    // Verificar se a mensagem já existe
    const existingMessage = await messagesRef.doc(message.messageId!).get()
    if (existingMessage.exists) {
      console.log('Mensagem já processada, ignorando:', message.messageId)
      return NextResponse.json({ status: 'ignored', reason: 'message already processed' })
    }

    const conversationDoc = await conversationRef.get()
    
    let conversationHistory: any[] = []
    let isFirstMessage = false
    let conversationData = null

    if (!conversationDoc.exists) {
      isFirstMessage = true
      console.log('Criando nova conversa para:', userPhone)
      
      // Create new conversation
      const newConversationData = {
        customerPhone: userPhone,
        customerName: userName,
        customerAvatar: message.senderPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`,
        lastMessage: userMessage,
        timestamp: new Date().toISOString(),
        unreadCount: 0,
        status: 'open',
        aiEnabled: true,
        aiPaused: false,
        conversationStatus: 'ai_active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      console.log('Dados da nova conversa:', newConversationData)
      await conversationRef.set(newConversationData)
      conversationData = newConversationData
    } else {
      conversationData = conversationDoc.data()
      
      // Se a conversa estava resolvida e o cliente enviou nova mensagem, reabrir para IA
      if (conversationData?.conversationStatus === 'resolved') {
        console.log('Reabrindo conversa resolvida para IA ativa')
        await conversationRef.update({
          aiEnabled: true,
          aiPaused: false,
          conversationStatus: 'ai_active',
          lastMessage: userMessage,
          timestamp: new Date().toISOString(),
          unreadCount: 0,
          resolvedAt: null,
          resolvedBy: null,
          updatedAt: new Date().toISOString(),
        })
        conversationData = { ...conversationData, conversationStatus: 'ai_active' }
        // Enviar mensagem de reabertura da Clara
        const reaberturaMsg = 'Olá, sou a Clara! O atendimento foi reaberto. Como posso ajudar você novamente?'
        await sendMessage(config, userPhone, reaberturaMsg)
        // Salvar mensagem de reabertura no Firestore
        await messagesRef.add({
          id: `clara_reabertura_${Date.now()}`,
          chatId: userPhone,
          role: 'agent',
          agentName: 'Clara',
          userName: 'Clara',
          content: reaberturaMsg,
          timestamp: new Date().toISOString(),
          status: 'sent',
          origin: 'ia_reabertura',
          fromMe: true
        })
        // Delay de 1 segundo para garantir ordem de entrega
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // Atualizar última mensagem e incrementar contador de não lidas
        await conversationRef.update({
          lastMessage: userMessage,
          timestamp: new Date().toISOString(),
          unreadCount: (conversationData.unreadCount || 0) + 1,
          updatedAt: new Date().toISOString()
        })
      }
    }

    // Salvar mensagem do usuário no Firestore
    const userMessageData = {
      id: message.messageId!,
      chatId: userPhone,
      role: 'user',
      content: userMessage,
      timestamp: new Date(message.momment! * 1000).toISOString(),
      status: 'received',
      // Adicionar informações de mídia se houver
      ...(mediaInfo && { 
        mediaType: mediaInfo.type as 'image' | 'audio' | 'video' | 'document' | 'contact' | 'location',
        mediaUrl: mediaInfo.url,
        mediaInfo: mediaInfo 
      })
    }

    // Salvar mensagem do usuário
    await messagesRef.doc(message.messageId!).set(userMessageData)
    console.log('Mensagem do usuário salva:', message.messageId)

    // Buscar histórico de mensagens para IA
    const messagesSnapshot = await messagesRef
      .orderBy('timestamp', 'asc')
      .limit(20)
      .get()
    
    conversationHistory = messagesSnapshot.docs.map((doc: any) => ({
      role: doc.data().role,
      content: doc.data().content
    }))

    // Prepare messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: config.systemPrompt
      },
      ...conversationHistory.slice(-10)
    ]

    // If first message, prepend welcome context
    if (isFirstMessage) {
      messages.push({
        role: 'assistant',
        content: config.welcomeMessage
      })
    }

    console.log('Enviando para OpenAI:', messages.length, 'mensagens')

    // Logar prompt e delays usados
    console.log('[IA DEBUG] Prompt usado (systemPrompt):', config.systemPrompt)
    console.log('[IA DEBUG] Delay Min:', config.responseDelayMin, 'Delay Max:', config.responseDelayMax, 'Delay Fixo:', config.responseDelaySeconds)

    // Call OpenAI API with error handling
    let aiResponse: string
    try {
      // Garantir que os valores numéricos sejam do tipo correto
      const temperature = typeof config.openaiTemperature === 'string' 
        ? parseFloat(config.openaiTemperature) 
        : (config.openaiTemperature || 0.7)
      
      const maxTokens = typeof config.openaiMaxTokens === 'string' 
        ? parseInt(config.openaiMaxTokens) 
        : (config.openaiMaxTokens || 500)
      
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.openaiModel,
          messages: messages,
          temperature: temperature,
          max_tokens: maxTokens
        })
      })

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        console.error('Erro na API OpenAI:', openaiResponse.status, errorText)
        throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`)
      }

      const openaiData = await openaiResponse.json()
      aiResponse = openaiData.choices[0]?.message?.content || config.fallbackMessage

      console.log('Resposta da OpenAI:', aiResponse)

    } catch (error) {
      console.error('Erro ao chamar OpenAI:', error)
      aiResponse = config.fallbackMessage
    }

    // Add AI response to history
    const aiMessageData = {
      id: `ai_${Date.now()}`,
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
      phone: userPhone,
      name: 'Assistente IA'
    }

    conversationHistory.push(aiMessageData)

    const finalUpdateData = {
      messages: conversationHistory,
      updatedAt: new Date().toISOString(),
      lastMessage: aiResponse,
      lastMessageAt: new Date().toISOString(),
    }

    // Update conversation in Firebase
    console.log('--- DADOS PARA ATUALIZAR CONVERSA (update) ---', JSON.stringify(finalUpdateData, null, 2))
    await conversationRef.update(finalUpdateData)

    // Send AI response via Z-API
    await sendMessage(config, userPhone, aiResponse)

    // Analyze message and trigger webhooks if needed
    await analyzeAndTriggerWebhooks(config, userMessage, userPhone, userName, aiResponse)

    console.log('Mensagem processada com sucesso')
    return NextResponse.json({ 
      status: 'processed', 
      response: aiResponse,
      phone: userPhone
    })

  } catch (error) {
    console.error('Erro ao processar mensagem:', error)
    return NextResponse.json(
      { error: 'Erro ao processar mensagem', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    )
  }
}

// Função para gerar delay humanizado
function generateHumanDelay(minSeconds: number, maxSeconds: number): number {
  const min = Math.max(1, minSeconds || 2) // Mínimo de 1 segundo
  const max = Math.max(min, maxSeconds || 5) // Máximo pelo menos igual ao mínimo
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Função para simular digitação (delay baseado no tamanho da mensagem)
function calculateTypingDelay(message: string, baseDelaySeconds: number): number {
  const wordsPerMinute = 40 // Velocidade média de digitação
  const wordsCount = message.split(' ').length
  const typingTimeSeconds = (wordsCount / wordsPerMinute) * 60
  
  // Combina delay base + tempo de digitação simulado (limitado a 15 segundos)
  return Math.min(baseDelaySeconds + Math.floor(typingTimeSeconds), 15)
}

async function sendMessage(config: AdminConfig, phone: string, message: string) {
  try {
    // Delay humanizado: aleatório entre responseDelayMin e responseDelayMax, se ambos existirem e forem válidos
    let delaySeconds = 1.5;
    if (
      typeof config.responseDelayMin === 'number' &&
      typeof config.responseDelayMax === 'number' &&
      config.responseDelayMin > 0 &&
      config.responseDelayMax >= config.responseDelayMin
    ) {
      delaySeconds = Math.random() * (config.responseDelayMax - config.responseDelayMin) + config.responseDelayMin;
      delaySeconds = Math.round(delaySeconds * 100) / 100; // arredonda para 2 casas decimais
      console.log(`[DELAY HUMANIZADO] Usando valor aleatório entre ${config.responseDelayMin}s e ${config.responseDelayMax}s: ${delaySeconds}s`);
    } else if (typeof config.responseDelaySeconds === 'number' && config.responseDelaySeconds > 0) {
      delaySeconds = config.responseDelaySeconds;
      console.log(`[DELAY FIXO] Usando responseDelaySeconds: ${delaySeconds}s`);
    } else {
      console.log(`[DELAY PADRÃO] Usando valor padrão: ${delaySeconds}s`);
    }
    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
    // Logar delay no Firestore
    await adminDB.collection('ia_delay_logs').add({
      phone,
      delaySeconds,
      delayMs: Math.round(delaySeconds * 1000),
      type: 'sendMessage',
      messagePreview: message.substring(0, 80),
      timestamp: new Date().toISOString()
    });
    // Enviar mensagem
    console.log(`📤 Enviando mensagem para ${phone}: ${message.substring(0, 50)}...`);
    const url = `https://api.z-api.io/instances/${config.zapiInstanceId}/token/${config.zapiApiKey}/send-text`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.zapiClientToken && config.zapiClientToken.trim()) {
      headers['Client-Token'] = config.zapiClientToken.trim();
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        phone: phone,
        message: message,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Z-API error: ${response.status} - ${errorText}`);
    }
    const result = await response.json();
    console.log('✅ Mensagem enviada com sucesso:', result);
    return result;
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem via Z-API:', error);
    throw error;
  }
}

async function analyzeAndTriggerWebhooks(
  config: AdminConfig, 
  userMessage: string, 
  phone: string, 
  name: string, 
  aiResponse: string
) {
  const lowerMessage = userMessage.toLowerCase()

  // Lead Capture triggers
  if (lowerMessage.includes('interesse') || 
      lowerMessage.includes('quero') || 
      lowerMessage.includes('preço') ||
      lowerMessage.includes('valor') ||
      lowerMessage.includes('pacote')) {
    
    await triggerWebhook(config.webhookUrls.leadCapture, 'lead_capture', {
      name,
      phone,
      message: userMessage,
      interest: extractInterest(userMessage),
      source: 'WhatsApp Bot',
      timestamp: new Date().toISOString()
    })
  }

  // Appointment Booking triggers
  if (lowerMessage.includes('agendar') || 
      lowerMessage.includes('consulta') || 
      lowerMessage.includes('reunião') ||
      lowerMessage.includes('encontro')) {
    
    await triggerWebhook(config.webhookUrls.appointmentBooking, 'appointment_booking', {
      customerName: name,
      phone,
      message: userMessage,
      requestedService: 'Consulta Personalizada',
      timestamp: new Date().toISOString()
    })
  }

  // Human Handoff triggers
  if (lowerMessage.includes('falar com') || 
      lowerMessage.includes('atendente') || 
      lowerMessage.includes('humano') ||
      lowerMessage.includes('pessoa') ||
      lowerMessage.includes('urgente')) {
    
    await triggerWebhook(config.webhookUrls.humanHandoff, 'human_handoff', {
      customerName: name,
      phone,
      reason: 'Solicitação de atendimento humano',
      context: userMessage,
      urgency: lowerMessage.includes('urgente') ? 'high' : 'medium',
      timestamp: new Date().toISOString()
    })
  }

  // Support Ticket triggers
  if (lowerMessage.includes('problema') || 
      lowerMessage.includes('erro') || 
      lowerMessage.includes('cancelar') ||
      lowerMessage.includes('reclamação') ||
      lowerMessage.includes('ajuda')) {
    
    await triggerWebhook(config.webhookUrls.supportTicket, 'support_ticket', {
      customerName: name,
      phone,
      issue: userMessage,
      priority: lowerMessage.includes('urgente') ? 'high' : 'medium',
      category: 'geral',
      timestamp: new Date().toISOString()
    })
  }
}

async function triggerWebhook(url: string, type: string, data: any) {
  if (!url) return

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Thermas-AI-Bot/1.0'
      },
      body: JSON.stringify({
        type,
        data,
        timestamp: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(5000) // 5 seconds timeout
    })

    console.log(`Webhook ${type} triggered:`, { url, success: response.ok })
  } catch (error) {
    console.error(`Erro ao disparar webhook ${type}:`, error)
  }
}

function extractInterest(message: string): string {
  const lowerMessage = message.toLowerCase()
  
  if (lowerMessage.includes('premium') || lowerMessage.includes('luxo')) {
    return 'Pacote Premium'
  }
  if (lowerMessage.includes('família') || lowerMessage.includes('criança')) {
    return 'Pacote Família'
  }
  if (lowerMessage.includes('casal') || lowerMessage.includes('romântico')) {
    return 'Pacote Casal'
  }
  if (lowerMessage.includes('spa') || lowerMessage.includes('massagem')) {
    return 'Spa & Bem-estar'
  }
  if (lowerMessage.includes('termal') || lowerMessage.includes('águas')) {
    return 'Águas Termais'
  }
  
  return 'Interesse Geral'
}

async function handleDeliveryStatus(body: any) {
  try {
    console.log('=== PROCESSANDO STATUS DE ENTREGA ===')
    console.log('Message ID:', body.messageId)
    console.log('Status:', body.status)
    console.log('Phone:', body.phone)
    
    if (!body.messageId || !body.phone) {
      console.error('Dados insuficientes para processar status de entrega')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Atualizar status da mensagem no Firestore
    const conversationRef = adminDB.collection('conversations').doc(body.phone)
    const messagesRef = conversationRef.collection('messages')
    
    try {
      await messagesRef.doc(body.messageId).update({
        status: body.status || 'delivered',
        statusTimestamp: new Date().toISOString()
      })
      console.log('Status de entrega atualizado com sucesso')
    } catch (error) {
      console.error('Erro ao atualizar status de entrega:', error)
    }
    
    return NextResponse.json({ status: 'delivery_status_updated' })
  } catch (error) {
    console.error('Erro ao processar status de entrega:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleReadStatus(body: any) {
  try {
    console.log('=== PROCESSANDO STATUS DE LEITURA ===')
    console.log('Message ID:', body.messageId)
    console.log('Status:', body.status)
    console.log('Phone:', body.phone)
    
    if (!body.messageId || !body.phone) {
      console.error('Dados insuficientes para processar status de leitura')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Atualizar status da mensagem no Firestore
    const conversationRef = adminDB.collection('conversations').doc(body.phone)
    const messagesRef = conversationRef.collection('messages')
    
    try {
      await messagesRef.doc(body.messageId).update({
        status: 'read',
        statusTimestamp: new Date().toISOString()
      })
      console.log('Status de leitura atualizado com sucesso')
    } catch (error) {
      console.error('Erro ao atualizar status de leitura:', error)
    }
    
    return NextResponse.json({ status: 'read_status_updated' })
  } catch (error) {
    console.error('Erro ao processar status de leitura:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  console.log('=== TESTE DE WEBHOOK ===')
  console.log('Webhook está funcionando!')
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Webhook Z-API está funcionando',
    timestamp: new Date().toISOString()
  })
} 