import { rollTest, rollDamage } from "./dice.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const INSANITY = {
  2: "Surto de violência contra alguém próximo",
  3: "Foge em pânico",
  4: "Desmaio",
  5: "Cegueira psicossomática",
  6: "Estupor",
  7: "Tiques e tremores incontroláveis",
  8: "Alucinações",
  9: "Disartria — não consegue falar",
  10: "Riso histérico",
  11: "Choro compulsivo",
  12: "Narrador assume o controle"
};

const speaker = () => ChatMessage.getSpeaker();

async function rollSanityLoss(formula, label) {
  const roll = await new Roll(formula).evaluate();
  const content = `
    <div class="ci-chat-card ci-narrator-roll-card ci-sanity-loss-card">
      <div class="ci-narrator-roll-heading">
        <div><span class="ci-narrator-kicker">PERDA DE SANIDADE</span><strong>${label}</strong></div>
        <div class="ci-narrator-roll-total">${roll.total}</div>
      </div>
      <div class="ci-narrator-impact"><i class="fa-solid fa-brain"></i><span>Pontos de Sanidade perdidos</span><strong>${formula}</strong></div>
      <div class="ci-chat-detail">Rolagem: ${roll.formula}</div>
    </div>`;
  await roll.toMessage({ speaker: speaker(), flavor: `${label} · ${roll.total} PdS`, content });
}

async function rollTemporaryInsanity() {
  const roll = await new Roll("2d6").evaluate();
  const result = INSANITY[roll.total];
  const duration = await new Roll("1d6").evaluate();
  const content = `
    <div class="ci-chat-card ci-insanity-card">
      <div class="ci-insanity-banner"><i class="fa-solid fa-brain"></i><span>INSANIDADE TEMPORÁRIA</span></div>
      <div class="ci-insanity-roll"><span>Resultado da rolagem</span><strong>${roll.total}</strong><small>2d6</small></div>
      <div class="ci-insanity-consequence">${result}</div>
      <div class="ci-insanity-rules">
        <div><i class="fa-regular fa-clock"></i><span>Duração</span><strong>${duration.total} minutos</strong></div>
        <div><i class="fa-solid fa-arrow-down"></i><span>Testes</span><strong>-2 em Testes</strong></div>
      </div>
    </div>`;
  await ChatMessage.create({ speaker: speaker(), content, flavor: `Insanidade Temporária · ${roll.total} · ${duration.total} min` });
}

async function rollRecovery(formula, label) {
  const roll = await new Roll(formula).evaluate();
  const content = `
    <div class="ci-chat-card ci-narrator-roll-card ci-recovery-card">
      <div class="ci-narrator-roll-heading">
        <div><span class="ci-narrator-kicker">TEMPO DE RECUPERAÇÃO</span><strong>${label}</strong></div>
        <div class="ci-narrator-roll-total">${roll.total}</div>
      </div>
      <div class="ci-narrator-impact"><i class="fa-regular fa-clock"></i><span>Tempo</span><strong>minutos</strong></div>
      <div class="ci-chat-detail">Rolagem: ${roll.formula}</div>
    </div>`;
  await roll.toMessage({ speaker: speaker(), flavor: `${label} · ${roll.total} minutos`, content });
}

async function rollFrenzy() {
  const roll = await new Roll("2d6").evaluate();
  let impacted = "Nenhum investigador impactado";
  let impactedCount = 0;
  if (roll.total >= 4 && roll.total <= 6) { impacted = "1 investigador perde a Âncora"; impactedCount = 1; }
  else if (roll.total >= 7 && roll.total <= 9) { impacted = "2 investigadores perdem a Âncora"; impactedCount = 2; }
  else if (roll.total >= 10) { impacted = "3 investigadores perdem a Âncora"; impactedCount = 3; }
  const content = `
    <div class="ci-chat-card ci-frenzy-card">
      <div class="ci-chat-kicker">FRENESI INVESTIGATIVO</div>
      <div class="ci-frenzy-days"><strong>${roll.total}</strong><span>dias de dedicação ao caso</span></div>
      <div class="ci-frenzy-consequence ${impactedCount ? "has-impact" : "no-impact"}">${impacted}</div>
    </div>`;
  await roll.toMessage({ speaker: speaker(), content, flavor: `Frenesi Investigativo · ${roll.total} dias` });
}

async function announceOrder() {
  const content = `
    <div class="ci-order-chat">
      <strong>Ordem de ações</strong>
      <ol>
        <li>Surpresos — agem por último</li>
        <li>Armas de fogo prontas</li>
        <li>Armas brancas prontas</li>
        <li>Armas de fogo sem preparação</li>
        <li>Armas brancas sem preparação</li>
        <li>Agir desarmado</li>
      </ol>
    </div>`;
  await ChatMessage.create({ speaker: speaker(), content });
}

async function rollPresence(formula, label) {
  if (!formula) {
    const content = `<div class="ci-chat-card ci-presence-card presence-none"><div class="ci-presence-heading"><div><span class="ci-presence-kicker">PRESENÇA INSÓLITA</span><strong>Mundano</strong></div><div class="ci-presence-total">0</div></div><div class="ci-presence-impact"><i class="fa-solid fa-shield-heart"></i><span>Sem perda de Sanidade</span></div></div>`;
    await ChatMessage.create({ speaker: speaker(), content, flavor: "Presença Insólita · Mundano · Sem perda de Sanidade" });
    return;
  }
  const roll = await new Roll(formula).evaluate();
  const content = `<div class="ci-chat-card ci-presence-card"><div class="ci-presence-heading"><div><span class="ci-presence-kicker">PRESENÇA INSÓLITA</span><strong>${label}</strong></div><div class="ci-presence-total">${roll.total}</div></div><div class="ci-presence-impact"><i class="fa-solid fa-brain"></i><span>Perda de Sanidade</span><strong>${formula}</strong></div><div class="ci-chat-detail">Rolagem: ${roll.formula}</div></div>`;
  await roll.toMessage({ speaker: speaker(), flavor: `Presença Insólita · ${label} · ${roll.total} PdS`, content });
}

export class NarratorResourcesApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["casos-insolitos", "ci-narrator-resources"],
    position: { width: 720, height: 720 },
    window: { title: "Recursos do Narrador", icon: "fa-solid fa-book-skull", resizable: true }
  };

  static PARTS = {
    main: { template: "systems/casos-insolitos/templates/narrator-resources.hbs" }
  };

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    if (!root || root.dataset.ciBound) return;
    root.dataset.ciBound = "true";
    root.addEventListener("click", async event => {
      const button = event.target.closest("[data-roll]");
      if (!button) return;
      const action = button.dataset.roll;
      if (action === "test") await rollTest(null);
      else if (action === "specialist") await rollTest(null, { specialist: true });
      else if (action === "damage") await rollDamage(button.dataset.formula, button.dataset.label || "Dano");
      else if (action === "sanity") await rollSanityLoss(button.dataset.formula, button.dataset.label);
      else if (action === "insanity") await rollTemporaryInsanity();
      else if (action === "recovery") await rollRecovery(button.dataset.formula, button.dataset.label);
      else if (action === "frenzy") await rollFrenzy();
      else if (action === "order") await announceOrder();
      else if (action === "presence") await rollPresence(button.dataset.formula || null, button.dataset.label || "Mundano");
    });
  }
}

export async function openNarratorResources() {
  return new NarratorResourcesApplication().render({ force: true });
}
