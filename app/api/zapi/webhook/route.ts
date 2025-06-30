import { NextRequest, NextResponse } from 'next/server'
import { adminDB } from '@/lib/firebaseAdmin'
import { ChatMessage, Reaction } from '@/lib/models'
import { downloadAndSaveMedia, isFirebaseStorageUrl } from '@/lib/mediaUpload'

// Adicionar no topo do arquivo:
const recentReactionLogs = new Map<string, number>() // chave: messageId+reaction, valor: timestamp
const REACTION_LOG_THROTTLE_MS = 5000 // 5 segundos

// Recebe eventos enviados pela Z-API (https://developer.z-api.io/en/webhooks)
// Configure no painel da instância a URL: https://SEU_DOMINIO/api/zapi/webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('=== WEBHOOK Z-API RECEBIDO ===')
    console.log('Body completo:', JSON.stringify(body, null, 2))

    // 1. Ignorar eventos de status e callbacks que não são mensagens reais
    const type = body.type || ''
    if (
      type === 'MessageStatusCallback' ||
      type === 'DeliveryCallback' ||
      type === 'ReadCallback' ||
      type === 'MessageStatus' ||
      type === 'StatusCallback' ||
      type === 'PresenceCallback' ||
      type === 'AckCallback' ||
      type === 'ReactionCallback'
    ) {
      console.log('Evento de status/callback ignorado:', type)
      return NextResponse.json({ ignored: true, reason: 'status_callback' })
    }

    // Validações básicas
    if (!body.phone || !body.messageId) {
      console.error('Dados obrigatórios ausentes:', { phone: body.phone, messageId: body.messageId })
      return NextResponse.json({ error: 'Phone e messageId são obrigatórios' }, { status: 400 })
    }

    // Verificar se já processamos esta mensagem (evitar duplicatas)
    if (body.messageId) {
      const conversationRef = adminDB.collection('conversations').doc(body.phone)
      const existingMessage = await conversationRef.collection('messages').doc(body.messageId).get()
      if (existingMessage.exists) {
        // Se a mensagem é do atendente (fromMe: true), atualizar nome/status se necessário
        if (body.fromMe) {
          const updateData: any = {}
          if (body.senderName) {
            const currentName = existingMessage.data()?.agentName;
            if (!currentName || currentName === 'Atendente' || currentName === 'Agência B0om') {
              updateData.agentName = body.senderName;
              updateData.userName = body.senderName;
            }
          }
          if (existingMessage.data()?.status !== 'sent') {
            updateData.status = 'sent'
          }
          if (Object.keys(updateData).length > 0) {
            await existingMessage.ref.update(updateData)
            console.log('Mensagem do atendente atualizada (nome/status):', body.messageId)
          } else {
            console.log('Mensagem já processada:', body.messageId)
          }
          return NextResponse.json({ ignored: true, reason: 'already_processed_and_updated' })
        } else {
          console.log('Mensagem já processada:', body.messageId)
          return NextResponse.json({ ignored: true, reason: 'already_processed' })
        }
      }
    }

    // Deduplicação robusta: se fromMe: true, buscar por zapiMessageId antes de criar nova mensagem
    if (body.fromMe && body.messageId) {
      const conversationRef = adminDB.collection('conversations').doc(body.phone)
      const zapiMsgQuery = await conversationRef.collection('messages')
        .where('zapiMessageId', '==', body.messageId)
        .limit(1)
        .get()
      if (!zapiMsgQuery.empty) {
        const msgDoc = zapiMsgQuery.docs[0]
        const updateData: any = {}
        if (body.senderName) {
          const currentName = msgDoc.data()?.agentName;
          if (!currentName || currentName === 'Atendente' || currentName === 'Agência B0om') {
            updateData.agentName = body.senderName;
            updateData.userName = body.senderName;
          }
        }
        if (msgDoc.data()?.status !== 'sent') {
          updateData.status = 'sent'
        }
        if (Object.keys(updateData).length > 0) {
          await msgDoc.ref.update(updateData)
          console.log('Mensagem do atendente atualizada por zapiMessageId:', body.messageId)
        } else {
          console.log('Mensagem do atendente já processada por zapiMessageId:', body.messageId)
        }
        return NextResponse.json({ ignored: true, reason: 'already_processed_by_zapiMessageId' })
      }
    }

    // --- DEDUPLICAÇÃO REFORÇADA: se fromMe: true, buscar por zapiMessageId antes de salvar ---
    if (body.fromMe && body.messageId) {
      const conversationRef = adminDB.collection('conversations').doc(body.phone)
      const zapiMsgQuery = await conversationRef.collection('messages')
        .where('zapiMessageId', '==', body.messageId)
        .limit(1)
        .get()
      if (!zapiMsgQuery.empty) {
        const msgDoc = zapiMsgQuery.docs[0]
        const updateData: any = {}
        if (body.senderName) {
          const currentName = msgDoc.data()?.agentName;
          if (!currentName || currentName === 'Atendente' || currentName === 'Agência B0om') {
            updateData.agentName = body.senderName;
            updateData.userName = body.senderName;
          }
        }
        if (msgDoc.data()?.status !== 'sent') {
          updateData.status = 'sent'
        }
        if (Object.keys(updateData).length > 0) {
          await msgDoc.ref.update(updateData)
          console.log('Mensagem do atendente atualizada por zapiMessageId (deduplicação reforçada):', body.messageId)
        } else {
          console.log('Mensagem do atendente já processada por zapiMessageId (deduplicação reforçada):', body.messageId)
        }
        return NextResponse.json({ ignored: true, reason: 'already_processed_by_zapiMessageId_reinforced' })
      }
    }

    console.log('Processando mensagem de entrada...')
    console.log('Estrutura completa do body:', JSON.stringify(body, null, 2))
    
    const {
      messageId,
      phone,
      momment,
      senderName,
      text,
      chatName,
      fromMe
    } = body

    // Processar diferentes tipos de conteúdo
    let content = ''
    let mediaInfo = null

    console.log('Verificando tipos de conteúdo:', {
      hasText: !!text?.message,
      hasImage: !!body.image,
      hasAudio: !!body.audio,
      hasVideo: !!body.video,
      hasDocument: !!body.document,
      hasContact: !!body.contact,
      hasLocation: !!body.location,
      hasReaction: !!body.reaction
    })

    // Referência da conversa (documento por telefone)
    const conversationRef = adminDB.collection('conversations').doc(phone)
    const conversationDoc = await conversationRef.get()
    
    let conversationData = null
    let replyToFirestoreId = null
    let replyToContent = null
    let replyToSender = null

    if (text?.message) {
      content = text.message
      console.log('Processando texto:', content)
    } else if (body.reaction) {
      // Controle de logs repetidos
      const reactionData = body.reaction
      let targetMessageId = body.reaction?.referencedMessage?.messageId || body.reaction?.messageId
      const reactionEmoji = reactionData.reaction
      const reactionLogKey = `${targetMessageId || ''}_${reactionEmoji || ''}`
      const now = Date.now()
      if (recentReactionLogs.has(reactionLogKey)) {
        const lastLog = recentReactionLogs.get(reactionLogKey) || 0
        if (now - lastLog < REACTION_LOG_THROTTLE_MS) {
          // Ignorar log repetido
        } else {
          recentReactionLogs.set(reactionLogKey, now)
          console.log('Processando reação:', body.reaction)
        }
      } else {
        recentReactionLogs.set(reactionLogKey, now)
        console.log('Processando reação:', body.reaction)
      }
      
      // Processar reação de mensagem
      const isReactionRemoved = reactionData.reaction === ''
      
      console.log('Dados da reação:', {
        targetMessageId,
        reactionEmoji,
        isReactionRemoved,
        fromMe: fromMe
      })
      
      // Buscar a mensagem alvo da reação
      let targetMessageDoc = null;
      if (targetMessageId) {
        try {
          // Primeiro tenta por zapiMessageId
          const targetMessageQuery = await conversationRef.collection('messages')
            .where('zapiMessageId', '==', targetMessageId)
            .limit(1)
            .get()
          if (!targetMessageQuery.empty) {
            targetMessageDoc = targetMessageQuery.docs[0]
          } else {
            // Tenta por id do Firestore
            const byIdDoc = await conversationRef.collection('messages').doc(targetMessageId).get()
            if (byIdDoc.exists) {
              targetMessageDoc = byIdDoc
            }
          }
        } catch (e) {
          console.error('Erro ao buscar mensagem alvo da reação:', e)
        }
      }
      if (!targetMessageDoc) {
        console.error('Mensagem alvo da reação não encontrada. Payload:', JSON.stringify(body, null, 2))
      }
      
      if (targetMessageDoc) {
        const targetMessageData = targetMessageDoc.data()
        
        console.log('Mensagem alvo encontrada:', targetMessageDoc.id)
        
        if (isReactionRemoved) {
          // Remover reação
          const currentReactions = targetMessageData.reactions || []
          const updatedReactions = currentReactions.filter((r: any) => 
            !(r.fromMe === fromMe && r.byPhone === phone)
          )
          
          await targetMessageDoc.ref.update({
            reactions: updatedReactions
          })
          
          console.log('Reação removida com sucesso')
          content = `Reação removida de uma mensagem`
        } else {
          // Adicionar reação
          const newReaction: Reaction = {
            emoji: reactionEmoji,
            by: senderName || 'Cliente',
            byPhone: phone,
            fromMe: !!fromMe,
            timestamp: new Date().toISOString()
          }
          
          // Verificar se já existe uma reação do mesmo usuário
          const currentReactions = targetMessageData.reactions || []
          const existingReactionIndex = currentReactions.findIndex((r: any) => 
            r.fromMe === fromMe && r.byPhone === phone
          )
          
          let updatedReactions
          if (existingReactionIndex >= 0) {
            // Atualizar reação existente
            updatedReactions = [...currentReactions]
            updatedReactions[existingReactionIndex] = newReaction
          } else {
            // Adicionar nova reação
            updatedReactions = [...currentReactions, newReaction]
          }
          
          await targetMessageDoc.ref.update({
            reactions: updatedReactions
          })
          
          console.log('Reação adicionada/atualizada com sucesso')
          content = `Reagiu com ${reactionEmoji} a uma mensagem`
        }
      } else {
        console.warn('Mensagem alvo da reação não encontrada:', targetMessageId)
        console.warn('Payload completo da reação não encontrada:', JSON.stringify(body, null, 2))
        content = `Reagiu com ${reactionEmoji} a uma mensagem apagada`
      }
      
      mediaInfo = {
        type: 'reaction',
        targetMessageId: reactionData.messageId,
        reaction: reactionEmoji,
        isRemoved: isReactionRemoved
      }
    } else if (body.image) {
      console.log('Processando imagem:', body.image)
      content = `📷 Imagem enviada${body.image.caption ? `: ${body.image.caption}` : ''}`
      
      // FLUXO OBRIGATÓRIO: Download e salvamento no Firebase Storage
      let storageUrl = body.image.imageUrl
      if (body.image.imageUrl && !isFirebaseStorageUrl(body.image.imageUrl)) {
        console.log('Download e salvamento de imagem no Firebase Storage...')
        const storageResult = await downloadAndSaveMedia(
          body.image.imageUrl,
          'image',
          `image_${Date.now()}.jpg`
        )
        
        if (storageResult.success) {
          storageUrl = storageResult.fileUrl!
          console.log('Imagem salva no Storage:', storageUrl)
        } else {
          console.error('Erro ao salvar imagem no Storage:', storageResult.error)
          // Usar URL original como fallback
          storageUrl = body.image.imageUrl
        }
      }
      
      mediaInfo = {
        type: 'image',
        url: storageUrl,
        caption: body.image.caption,
        mimeType: body.image.mimeType
      }
    } else if (body.audio) {
      console.log('Processando áudio:', body.audio)
      content = '🎵 Áudio'
      
      // FLUXO OBRIGATÓRIO: Download e salvamento no Firebase Storage
      let storageUrl = body.audio.audioUrl
      if (body.audio.audioUrl && !isFirebaseStorageUrl(body.audio.audioUrl)) {
        console.log('Download e salvamento de áudio no Firebase Storage...')
        const storageResult = await downloadAndSaveMedia(
          body.audio.audioUrl,
          'audio',
          `audio_${Date.now()}.mp3`
        )
        
        if (storageResult.success) {
          storageUrl = storageResult.fileUrl!
          console.log('Áudio salvo no Storage:', storageUrl)
        } else {
          console.error('Erro ao salvar áudio no Storage:', storageResult.error)
          // Usar URL original como fallback
          storageUrl = body.audio.audioUrl
        }
      }
      
      mediaInfo = {
        type: 'audio',
        url: storageUrl,
        mimeType: body.audio.mimeType
      }
    } else if (body.video) {
      console.log('Processando vídeo:', body.video)
      content = `🎬 Vídeo${body.video.caption ? `: ${body.video.caption}` : ''}`
      
      // FLUXO OBRIGATÓRIO: Download e salvamento no Firebase Storage
      let storageUrl = body.video.videoUrl
      if (body.video.videoUrl && !isFirebaseStorageUrl(body.video.videoUrl)) {
        console.log('Download e salvamento de vídeo no Firebase Storage...')
        const storageResult = await downloadAndSaveMedia(
          body.video.videoUrl,
          'video',
          `video_${Date.now()}.mp4`
        )
        
        if (storageResult.success) {
          storageUrl = storageResult.fileUrl!
          console.log('Vídeo salvo no Storage:', storageUrl)
        } else {
          console.error('Erro ao salvar vídeo no Storage:', storageResult.error)
          // Usar URL original como fallback
          storageUrl = body.video.videoUrl
        }
      }
      
      mediaInfo = {
        type: 'video',
        url: storageUrl,
        caption: body.video.caption,
        mimeType: body.video.mimeType
      }
    } else if (body.document) {
      console.log('Processando documento:', body.document)
      content = `📄 ${body.document.title || 'Documento'}`
      
      // FLUXO OBRIGATÓRIO: Download e salvamento no Firebase Storage
      let storageUrl = body.document.documentUrl
      if (body.document.documentUrl && !isFirebaseStorageUrl(body.document.documentUrl)) {
        console.log('Download e salvamento de documento no Firebase Storage...')
        const storageResult = await downloadAndSaveMedia(
          body.document.documentUrl,
          'document',
          body.document.title || `document_${Date.now()}.pdf`
        )
        
        if (storageResult.success) {
          storageUrl = storageResult.fileUrl!
          console.log('Documento salvo no Storage:', storageUrl)
        } else {
          console.error('Erro ao salvar documento no Storage:', storageResult.error)
          // Usar URL original como fallback
          storageUrl = body.document.documentUrl
        }
      }
      
      mediaInfo = {
        type: 'document',
        url: storageUrl,
        title: body.document.title,
        mimeType: body.document.mimeType
      }
    } else if (body.contact) {
      content = `👤 ${body.contact.displayName}`
      mediaInfo = {
        type: 'contact',
        displayName: body.contact.displayName,
        vcard: body.contact.vcard
      }
    } else if (body.location) {
      content = `📍 ${body.location.address || 'Localização'}`
      mediaInfo = {
        type: 'location',
        latitude: body.location.latitude,
        longitude: body.location.longitude,
        address: body.location.address
      }
    } else {
      content = '[Mensagem sem texto]'
    }

    // Após definir 'content', sanitizar prefixo do atendente:
    if (content && typeof content === 'string') {
      // Remove prefixo do tipo *Nome:*\n do início do texto
      content = content.replace(/^\*[\w\s]+:\*\s*\n?/, '').trim()
    }

    const timestamp = momment ? new Date(momment).toISOString() : new Date().toISOString()
    
    console.log('Dados extraídos:', { phone, content, messageId, senderName })

    // Extrair referência de resposta (reply) se houver
    const replyTo = body.referenceMessageId || body.quotedMsgId || body.context?.id || null;

    // Processar reply se houver
    if (replyTo) {
      try {
        const replyQuery = await conversationRef.collection('messages')
          .where('zapiMessageId', '==', replyTo)
          .limit(1)
          .get()
        
        if (!replyQuery.empty) {
          const replyDoc = replyQuery.docs[0]
          replyToFirestoreId = replyDoc.id
          replyToContent = replyDoc.data().content
          replyToSender = replyDoc.data().agentName || 'Cliente'
        }
      } catch (error) {
        console.warn('Erro ao buscar mensagem de resposta:', error)
      }
    }

    // Criar ou atualizar conversa
    if (!conversationDoc.exists) {
      console.log('Criando nova conversa')
      conversationData = {
        phone: phone,
        name: senderName || chatName || phone,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessage: content,
        timestamp: timestamp,
        status: 'active',
        unreadCount: 1,
        aiEnabled: true,
        aiPaused: false,
        conversationStatus: 'ai_active',
        source: 'zapi'
      }
      await conversationRef.set(conversationData)
    } else {
      conversationData = conversationDoc.data()
      
      // Atualizar última mensagem e incrementar contador de não lidas
      await conversationRef.update({
        lastMessage: content,
        timestamp: timestamp,
        unreadCount: (conversationData.unreadCount || 0) + 1,
        updatedAt: timestamp
      })
    }

    // Atualizar unreadCount
    if (!fromMe) {
      // Mensagem recebida do cliente: incrementar unreadCount
      await conversationRef.update({
        unreadCount: (conversationData?.unreadCount || 0) + 1,
        updatedAt: new Date().toISOString()
      })
    } else {
      // Mensagem enviada pelo painel: resetar unreadCount
      await conversationRef.update({
        unreadCount: 0,
        updatedAt: new Date().toISOString()
      })
    }

    // --- NOVA LÓGICA: Só salvar mensagem se houver conteúdo real ---
    const hasRealContent = (
      (content && content !== '[Mensagem sem texto]') ||
      (mediaInfo && mediaInfo.url) ||
      (mediaInfo && mediaInfo.type === 'reaction') ||
      (body.contact) ||
      (body.location)
    )

    if (!hasRealContent) {
      console.log('Ignorando mensagem sem conteúdo real. Não será salva no Firestore.')
      return NextResponse.json({ ignored: true, reason: 'empty_message' })
    }

    // Nova validação: nunca salvar se faltar messageId ou phone
    if (!messageId || !phone) {
      console.error('Tentativa de salvar mensagem sem messageId ou phone:', { messageId, phone })
      return NextResponse.json({ ignored: true, reason: 'missing_messageId_or_phone' })
    }

    // --- DEDUPLICAÇÃO POR CONTEÚDO E TEMPO: evitar duplicidade de IA e atendente ---
    if (fromMe && content) {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const recentMsgQuery = await conversationRef.collection('messages')
        .where('role', '==', 'agent')
        .where('content', '==', content)
        .where('timestamp', '>=', twoMinutesAgo.toISOString())
        .limit(1)
        .get();
      if (!recentMsgQuery.empty) {
        const msgDoc = recentMsgQuery.docs[0];
        const updateData: any = {};
        if (senderName) {
          const currentName = msgDoc.data()?.agentName;
          if (!currentName || currentName === 'Atendente' || currentName === 'Agência B0om' || currentName === 'Clara') {
            updateData.agentName = senderName;
            updateData.userName = senderName;
          }
        }
        if (msgDoc.data()?.status !== 'sent') {
          updateData.status = 'sent';
        }
        if (Object.keys(updateData).length > 0) {
          await msgDoc.ref.update(updateData);
          console.log('Mensagem do atendente/IA atualizada por deduplicação de conteúdo:', messageId);
        } else {
          console.log('Mensagem do atendente/IA já processada por deduplicação de conteúdo:', messageId);
        }
        return NextResponse.json({ ignored: true, reason: 'already_processed_by_content_time' });
      }
    }

    // Salvar mensagem no Firestore
    const msg: Partial<ChatMessage> = {
      content,
      role: fromMe ? 'agent' : 'user',
      timestamp,
      status: 'sent',
      origin: fromMe ? 'panel' : 'device',
      fromMe: !!fromMe,
      chatId: phone,
      customerPhone: phone,
      ...(mediaInfo && { 
        mediaType: mediaInfo.type as 'image' | 'audio' | 'video' | 'document' | 'contact' | 'location',
        mediaUrl: mediaInfo.url,
        mediaInfo: mediaInfo 
      }),
      ...(replyTo && {
        replyTo: replyToFirestoreId && replyToContent ? {
          id: replyToFirestoreId,
          text: replyToContent,
          author: replyToSender === 'Atendente' || replyToSender === 'IA Assistente' ? 'agent' : 'customer'
        } : {
          id: replyTo,
          text: 'Mensagem removida',
          author: 'customer'
        }
      })
    }
    await conversationRef.collection('messages').doc(messageId).set(msg)

    console.log('Mensagem salva com sucesso no Firestore')

    // Atualizar ou limpar foto de perfil do cliente conforme o campo photo
    if (body.hasOwnProperty('photo')) {
      if (body.photo) {
        await conversationRef.set({ customerAvatar: body.photo }, { merge: true });
      } else {
        await conversationRef.set({ customerAvatar: '' }, { merge: true });
      }
    }

    // --- IA: Resposta automática se habilitada ---
    // Só responder se NÃO for mensagem do atendente (fromMe: false)
    if (!fromMe && conversationData?.aiEnabled && conversationData?.conversationStatus === 'ai_active') {
      try {
        // Buscar últimas 10 mensagens para contexto
        const messagesSnapshot = await conversationRef.collection('messages')
          .orderBy('timestamp', 'desc')
          .limit(10)
          .get();
        const context = messagesSnapshot.docs.reverse().map((doc: any) => {
          const data = doc.data();
          return `${data.role === 'user' ? 'Cliente' : 'Assistente'}: ${data.content}`;
        }).join('\n');

        // Buscar config da IA
        const configDoc = await adminDB.collection('admin_config').doc('ai_settings').get();
        const config = configDoc.exists ? configDoc.data() : {};
        const systemPrompt = config.systemPrompt || 'Você é um assistente do Grupo Thermas.';
        const openaiApiKey = config.openaiApiKey;
        const openaiModel = config.openaiModel || 'gpt-4o-mini';
        const temperature = typeof config.openaiTemperature === 'string' ? parseFloat(config.openaiTemperature) : (config.openaiTemperature || 0.7);
        const maxTokens = typeof config.openaiMaxTokens === 'string' ? parseInt(config.openaiMaxTokens) : (config.openaiMaxTokens || 500);

        if (!openaiApiKey) throw new Error('OpenAI API Key não configurada');

        // Montar payload para OpenAI
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: openaiModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Contexto da conversa:\n${context}\n\nNova mensagem: ${content}` }
            ],
            temperature,
            max_tokens: maxTokens
          })
        });
        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
        }
        const openaiData = await openaiResponse.json();
        const aiMessage = openaiData.choices?.[0]?.message?.content?.trim() || config.fallbackMessage || 'Desculpe, não entendi completamente.';

        // Salvar resposta da IA no Firestore como atendente 'Clara'
        const aiMsg = {
          content: aiMessage,
          role: 'agent',
          agentName: 'Clara',
          userName: 'Clara',
          timestamp: new Date().toISOString(),
          status: 'sent',
          origin: 'ai',
          chatId: phone,
          customerPhone: phone
        };
        await conversationRef.collection('messages').add(aiMsg);

        // Atualizar conversa
        await conversationRef.update({
          lastMessage: aiMessage,
          timestamp: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Enviar resposta da IA via Z-API, prefixando com o nome 'Clara'
        if (config.zapiApiKey && config.zapiInstanceId) {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (config.zapiClientToken && config.zapiClientToken.trim()) {
            headers['Client-Token'] = config.zapiClientToken.trim();
          }
          let zapiUrl = '';
          if (config.zapiBaseUrl && config.zapiBaseUrl.endsWith('/send-text')) {
            zapiUrl = config.zapiBaseUrl;
          } else {
            zapiUrl = `https://api.z-api.io/instances/${config.zapiInstanceId}/token/${config.zapiApiKey}/send-text`;
          }
          const messageWithName = `*Clara:*
${aiMessage}`;
          console.log('[IA->ZAPI] Enviando resposta da IA para o cliente:', { phone, aiMessage: messageWithName, zapiUrl, headers });
          const zapiResponse = await fetch(zapiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              phone,
              message: messageWithName
            })
          });
          const zapiResultText = await zapiResponse.text();
          let zapiResult: any = {};
          try { zapiResult = JSON.parse(zapiResultText); } catch { zapiResult = zapiResultText; }
          console.log('[IA->ZAPI] Status:', zapiResponse.status, zapiResponse.statusText);
          console.log('[IA->ZAPI] Headers:', Object.fromEntries(zapiResponse.headers.entries()));
          console.log('[IA->ZAPI] Body:', zapiResult);
          if (!zapiResponse.ok) {
            console.error('[IA->ZAPI] Falha ao enviar resposta da IA:', zapiResult);
          }
        }
      } catch (err) {
        console.error('Erro ao responder com IA:', err);
      }
    }

    // --- EVITAR DUPLICIDADE: não salvar mensagem recebida da Z-API se for igual à última resposta da IA ---
    if (fromMe && conversationData?.lastMessage && content === conversationData.lastMessage) {
      console.log('Mensagem recebida da Z-API é igual à última resposta da IA. Ignorando para evitar duplicidade.');
      return NextResponse.json({ ignored: true, reason: 'ia_duplicate' });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Mensagem processada com sucesso',
      messageId: messageId,
      phone: phone
    })

  } catch (error) {
    console.error('Erro no webhook:', error)
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Webhook Z-API endpoint is working',
    timestamp: new Date().toISOString(),
    methods: ['POST'],
    usage: 'This endpoint receives webhooks from Z-API'
  })
} 