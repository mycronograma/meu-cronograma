import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Termos de Uso - Nexora',
  description: 'Regras de uso do Nexora: o que o serviço faz, planos, cancelamento e responsabilidades.',
};

export default function TermosPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="24 de setembro de 2026">
      <h2>1. O que é o Nexora</h2>
      <p>
        O Nexora é uma ferramenta de organização de estudos: monta cronogramas, distribui aulas,
        exercícios, revisões e simulados, e acompanha o seu progresso. O serviço é um apoio
        pedagógico — <strong>não garante aprovação</strong> em vestibular, ENEM, concurso ou
        qualquer prova, e não substitui escola, curso ou professor.
      </p>

      <h2>2. Sua conta</h2>
      <ul>
        <li>Você é responsável por manter a senha em segurança e por tudo que acontece na sua conta.</li>
        <li>Use dados verdadeiros: o cronograma depende das informações que você informa (horários, meta de horas, data da prova).</li>
        <li>Menores de 18 anos devem usar o serviço com consentimento de um responsável legal.</li>
      </ul>

      <h2>3. Planos e pagamento</h2>
      <ul>
        <li>O Nexora pode ser usado gratuitamente com limites de uso, e oferece planos pagos com recursos adicionais.</li>
        <li>Assinaturas são cobradas de forma recorrente até o cancelamento, pelo meio de pagamento escolhido.</li>
        <li>
          <strong>Direito de arrependimento:</strong> compras feitas pela internet podem ser
          canceladas em até 7 dias corridos da contratação, conforme o art. 49 do Código de Defesa
          do Consumidor, com devolução integral do valor pago.
        </li>
        <li>Ao cancelar, o acesso pago continua até o fim do período já pago; depois disso, a conta
          volta ao plano gratuito (seus dados continuam salvos).</li>
      </ul>

      <h2>4. Uso aceitável</h2>
      <ul>
        <li>Não é permitido tentar burlar limites de plano, automatizar acessos, revender o serviço ou extrair dados de outros usuários.</li>
        <li>Não é permitido usar o serviço para fins ilícitos ou para sobrecarregar a infraestrutura.</li>
        <li>Podemos suspender contas que violem estas regras, avisando sempre que possível.</li>
      </ul>

      <h2>5. Conteúdo e propriedade intelectual</h2>
      <p>
        O conteúdo que você cria (disciplinas, anotações, cronogramas) é seu. A marca, o código e os
        materiais do Nexora são nossos. Você pode exportar os seus dados a qualquer momento — e
        também apagar a conta, o que remove os dados, conforme a Política de Privacidade.
      </p>

      <h2>6. Disponibilidade</h2>
      <p>
        Trabalhamos para manter o serviço no ar, mas ele pode ficar indisponível em manutenções ou
        falhas. Seus dados ficam salvos no seu aparelho e sincronizam com a conta quando a conexão
        volta.
      </p>

      <h2>7. Mudanças nestes termos</h2>
      <p>
        Se os termos mudarem de forma relevante, avisamos pelo app ou por e-mail antes de valer.
        Continuar usando o serviço depois disso significa concordar com a nova versão.
      </p>

      <h2>8. Contato</h2>
      <p>
        Dúvidas sobre estes termos: responda o e-mail do suporte ou escreva para o endereço
        informado na página de contato do serviço.
      </p>
    </LegalPage>
  );
}
