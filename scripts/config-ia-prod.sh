#!/usr/bin/env bash
# Config da estratégia de IA no banco de PRODUÇÃO (17/11):
#  1. Gemini: chave da conta Pro (cifrada AES-GCM) + model gemini-2.5-flash (active=false)
#  2. aiRouting.chatProvider=gemini (chat/dicas → Gemini; extração segue no GLM ativo)
#  3. GLM: copia a chave do .env (ANTHROPIC_AUTH_TOKEN) pro banco — painel vira a fonte da verdade
#  4. Restart + logs do llm
# Uso (da máquina local): bash scripts/config-ia-prod.sh
set -e
GKEY=$(cat "D:/PESSOAL/PESSOAL/chamanoespeto-aws/gemini.key")
ssh -i /tmp/jano.pem -o ConnectTimeout=20 ec2-user@janocaminho.com.br "docker exec -w /app/packages/server -e GK='$GKEY' meus-exames-app node -e \"
const crypto=require('crypto');
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
function enc(plain){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',Buffer.from(process.env.APP_ENCRYPTION_KEY,'hex'),iv);const e=Buffer.concat([c.update(plain,'utf8'),c.final()]);return{apiKeyEnc:e.toString('hex')+':'+c.getAuthTag().toString('hex'),apiKeyIv:iv.toString('hex')}}
(async()=>{
  const g=enc(process.env.GK);
  await p.aiProviderConfig.upsert({where:{provider:'gemini'},create:{provider:'gemini',active:false,model:'gemini-2.5-flash',...g},update:{model:'gemini-2.5-flash',...g}});
  console.log('gemini OK');
  if(process.env.ANTHROPIC_AUTH_TOKEN){
    const a=enc(process.env.ANTHROPIC_AUTH_TOKEN);
    await p.aiProviderConfig.update({where:{provider:'anthropic'},data:a});
    console.log('glm(env->banco) OK');
  }
  await p.appSetting.upsert({where:{key:'aiRouting'},create:{key:'aiRouting',value:{chatProvider:'gemini'}},update:{value:{chatProvider:'gemini'}}});
  console.log('aiRouting OK');
  process.exit(0);
})().catch(e=>{console.error('ERRO',e.message);process.exit(1)});
\" && cd ~/meus-exames/janocaminho-meus-exames && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate 2>&1 | tail -1 && sleep 20 && docker logs meus-exames-app --tail 40 2>&1 | grep -i 'llm\\|listen'"
