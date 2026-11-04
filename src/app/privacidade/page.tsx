import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Política de Privacidade - Nexora',
  description: 'Como o Nexora trata seus dados: o que é coletado, por quê, onde fica e como você pode apagar.',
};

export default function PrivacidadePage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="24 de setembro de 2026">
      <h2>1. Resumo em uma linha</h2>
      <p>
        Guardamos só o necessário para o cronograma funcionar, não vendemos seus dados e você pode
        exportar ou apagar tudo a qualquer momento.
      </p>

      <h2>2. Quais dados tratamos</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail e senha (guardada apenas como hash). Ao entrar com
          o Google, recebemos nome, e-mail e foto do perfil.
        </li>
        <li>
          <strong>Estudo:</strong> disciplinas, cronogramas, blocos, sessões concluídas, tempos,
          pontuações de exercícios/simulados e anotações que você criar.
        </li>
        <li>
          <strong>Preferências:</strong> meta diária de horas, dias de descanso, janelas de horário,
          data da prova, opções de aparência.
        </li>
        <li>
          <strong>Notificações:</strong> se você ativar, guardamos o identificador de inscrição de
          push do aparelho.
        </li>
        <li>
          <strong>Segurança:</strong> registros técnicos de acesso (data/hora, endereço IP) para
          investigar abuso e proteger a conta.
        </li>
        <li>
          <strong>Pagamento:</strong> quando houver assinatura, os dados do cartão são tratados pelo
          meio de pagamento — nós recebemos apenas o status da cobrança e um identificador.
        </li>
      </ul>

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Montar e recalcular o seu cronograma e mostrar seu progresso.</li>
        <li>Sincronizar o estudo entre os seus aparelhos.</li>
        <li>Enviar avisos que você ativou (lembretes de sessão, resumo semanal).</li>
        <li>Dar suporte quando você relatar um problema.</li>
        <li>Manter o serviço seguro e cobrar assinaturas, quando contratadas.</li>
      </ul>
      <p>
        As bases legais são a execução do contrato (art. 7º, V da LGPD), o cumprimento de obrigações
        legais (fiscal e civil) e o legítimo interesse para segurança, sempre com o mínimo de dados.
      </p>

      <h2>4. Com quem compartilhamos</h2>
      <ul>
        <li>
          <strong>Infraestrutura:</strong> provedores de hospedagem e banco de dados que mantêm o
          serviço no ar (contratos com cláusulas de proteção de dados).
        </li>
        <li>
          <strong>Envio de e-mail:</strong> provedor de SMTP para verificação de conta e recuperação
          de senha.
        </li>
        <li>
          <strong>Notificações push:</strong> serviços do navegador/sistema para entregar o aviso.
        </li>
        <li>
          <strong>Pagamento:</strong> o meio de pagamento escolhido, para processar a cobrança.
        </li>
      </ul>
      <p>Não vendemos nem alugamos seus dados pessoais.</p>

      <h2>5. Por quanto tempo guardamos</h2>
      <p>
        Enquanto a conta existir. Se você apagar a conta, os dados de estudo são excluídos dos nossos
        sistemas ativos; registros fiscais de pagamento podem ser mantidos pelo prazo exigido por lei.
      </p>

      <h2>6. Seus direitos (LGPD, art. 18)</h2>
      <ul>
        <li>Confirmar se tratamos seus dados e acessá-los.</li>
        <li>Corrigir dados incompletos ou desatualizados (pelo próprio app, em Configurações).</li>
        <li>Exportar seus dados (portabilidade) e apagar a conta.</li>
        <li>Retirar o consentimento de notificações e de comunicações, a qualquer momento.</li>
        <li>Pedir informação sobre compartilhamentos e reclamar à ANPD.</li>
      </ul>

      <h2>7. Segurança</h2>
      <p>
        Senhas são guardadas como hash, o acesso usa sessão autenticada e o tráfego é cifrado em
        trânsito. Se acontecer um incidente relevante, avisamos os afetados e a ANPD, conforme a lei.
      </p>

      <h2>8. Crianças e adolescentes</h2>
      <p>
        Para menores de 18 anos, o tratamento é feito no melhor interesse do adolescente e depende do
        consentimento de quem tem a guarda — o app deve ser usado com o responsável ciente.
      </p>

      <h2>9. Como falar com a gente</h2>
      <p>
        Para exercer qualquer direito ou tirar dúvidas sobre privacidade, responda o e-mail do
        suporte ou escreva para o encarregado de dados (DPO) informado na página de contato. Você
        também pode usar Configurações &gt; Zona de perigo para apagar seus dados pelo próprio app.
      </p>
    </LegalPage>
  );
}
