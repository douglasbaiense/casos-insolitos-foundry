import { rollTest, rollDamage } from "./dice.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

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

export class InvestigatorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["casos-insolitos", "investigator-sheet"],
    position: { width: 1080, height: 820 },
    window: { icon: "fa-solid fa-file-circle-question", resizable: true },
    form: { closeOnSubmit: false, submitOnChange: false },
    actions: {
      test: InvestigatorSheet.#test,
      specialistTest: InvestigatorSheet.#specialistTest,
      damage: InvestigatorSheet.#damage,
      sanityShock: InvestigatorSheet.#sanityShock,
      temporaryInsanity: InvestigatorSheet.#temporaryInsanity,
      frenzy: InvestigatorSheet.#frenzy,
      recoverHP: InvestigatorSheet.#recoverHP,
      recoverSanity: InvestigatorSheet.#recoverSanity,
      clearInsanity: InvestigatorSheet.#clearInsanity,
      toggleState: InvestigatorSheet.#toggleState,
      createEquipment: InvestigatorSheet.#createEquipment,
      createWeapon: InvestigatorSheet.#createWeapon,
      editItem: InvestigatorSheet.#editItem,
      deleteItem: InvestigatorSheet.#deleteItem,
      toggleCarried: InvestigatorSheet.#toggleCarried,
      toggleEvidence: InvestigatorSheet.#toggleEvidence,
      useWeapon: InvestigatorSheet.#useWeapon,
      announceOrder: InvestigatorSheet.#announceOrder,
      showExamples: InvestigatorSheet.#showExamples
    }
  };

  get title() {
    return `Investigador: ${this.actor.name}`;
  }

  static PARTS = {
    header: { template: "systems/casos-insolitos/templates/actor-header.hbs" },
    content: { template: "systems/casos-insolitos/templates/actor-content.hbs" },
    footer: { template: "systems/casos-insolitos/templates/actor-footer.hbs" }
  };

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    // Keep the sheet interactive without submitting the entire form. This avoids
    // the annoying full re-render which used to reset the tab and scroll position.
    for (const button of root.querySelectorAll("[data-tab-target]")) {
      button.addEventListener("click", () => this.#activateTab(button.dataset.tabTarget));
    }

    for (const button of root.querySelectorAll("[data-examples]")) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const type = button.dataset.examples;
        for (const popover of root.querySelectorAll(".ci-examples-popover")) {
          const open = popover.dataset.examplesPanel === type && popover.hidden;
          popover.hidden = !open;
        }
      });
    }

    for (const input of root.querySelectorAll("[name]")) {
      if (input.closest(".ci-item-form")) continue;
      input.addEventListener("change", async (event) => {
        const field = event.currentTarget.name;
        if (!field || field === "") return;
        await this.#updateActorField(event.currentTarget, field);
      });
    }

    for (const input of root.querySelectorAll(".ci-inventory-input")) {
      input.addEventListener("change", async (event) => {
        const item = this.actor.items.get(event.currentTarget.dataset.itemId);
        const field = event.currentTarget.dataset.itemField;
        if (!item || !field) return;
        const value = event.currentTarget.type === "checkbox"
          ? event.currentTarget.checked
          : event.currentTarget.type === "number"
            ? Math.max(1, Number(event.currentTarget.value || 1))
            : event.currentTarget.value;
        if (field === "system.evidence") {
          event.currentTarget.closest(".inventory-row")?.classList.toggle("evidence", Boolean(value));
        }
        await item.update({ [field]: value }, { render: false });
      });
    }

    this.#restoreViewState();
    this.syncVisualState();
  }

  rememberViewState() {
    this.#rememberViewState();
  }

  async refreshPreservingView() {
    this.#rememberViewState();
    await this.render({ force: true });
  }

  #activateTab(tab) {
    const root = this.element;
    if (!root) return;
    for (const b of root.querySelectorAll("[data-tab-target]")) {
      b.classList.toggle("active", b.dataset.tabTarget === tab);
    }
    for (const panel of root.querySelectorAll("[data-tab-panel]")) {
      panel.classList.toggle("active", panel.dataset.tabPanel === tab);
    }
    this._ciActiveTab = tab;
  }

  #rememberViewState() {
    const root = this.element;
    if (!root) return;
    const active = root.querySelector("[data-tab-target].active")?.dataset.tabTarget;
    if (active) this._ciActiveTab = active;
    this._ciScrollTop = {};
    for (const panel of root.querySelectorAll("[data-tab-panel]")) {
      this._ciScrollTop[panel.dataset.tabPanel] = panel.scrollTop;
    }
  }

  #restoreViewState() {
    const root = this.element;
    if (!root) return;
    const tab = this._ciActiveTab || "investigator";
    this.#activateTab(tab);
    requestAnimationFrame(() => {
      for (const panel of root.querySelectorAll("[data-tab-panel]")) {
        const value = this._ciScrollTop?.[panel.dataset.tabPanel];
        if (Number.isFinite(value)) panel.scrollTop = value;
      }
    });
  }

  async #updateActorField(input, field) {
    let value = input.type === "checkbox" ? input.checked : input.value;
    if (field === "system.sanity.value") {
      const numeric = Math.max(0, Math.min(this.actor.system.sanity.max, Number(value || 0)));
      if (this.actor.system.states.adrift && numeric > this.actor.system.sanity.value) {
        input.value = this.actor.system.sanity.value;
        ui.notifications.warn("À Deriva: os Pontos de Sanidade não podem aumentar.");
        return;
      }
      value = numeric;
    }
    this.#rememberViewState();
    await this.actor.update({ [field]: value }, { render: false });
    this.syncVisualState();
  }

  syncVisualState() {
    const root = this.element;
    if (!root) return;
    const s = this.actor.system;

    for (const [key, value, max] of [
      ["hp", s.hp.value, s.hp.max],
      ["sanity", s.sanity.value, s.sanity.max]
    ]) {
      const card = root.querySelector(`.${key === "hp" ? "hp-card" : "sanity-card"}`);
      if (!card) continue;
      const valueInput = card.querySelector(`input[name="system.${key}.value"]`);
      if (valueInput) valueInput.value = value;
      const counter = card.querySelector(".resource-counter");
      if (counter) counter.textContent = `${value} / ${max}`;
      card.querySelectorAll(".pip").forEach((pip, index) => pip.classList.toggle("filled", index < value));
    }

    for (const button of root.querySelectorAll(".state-chip[data-state]")) {
      const active = Boolean(s.states[button.dataset.state]);
      button.classList.toggle("active", active);
      const icon = button.querySelector("i");
      if (icon) {
        const state = button.dataset.state;
        if (state === "dying") icon.className = active ? "fa-solid fa-circle" : "fa-regular fa-circle";
        else if (state === "temporaryInsanity") icon.className = active ? "fa-solid fa-circle" : "fa-regular fa-circle";
        else icon.className = `fa-solid ${active ? "fa-toggle-on" : "fa-toggle-off"}`;
      }
    }

    const warning = root.querySelector(".insanity-warning");
    if (warning) warning.hidden = !s.states.temporaryInsanity;

    const anchorInput = root.querySelector(".anchor-input");
    if (anchorInput) anchorInput.classList.toggle("anchor-struck", Boolean(s.states.adrift));
    const sanityDanger = root.querySelector(".sanity-danger");
    if (sanityDanger) sanityDanger.hidden = !s.states.adrift;

    const conditionButtons = root.querySelectorAll("[data-condition-state]");
    for (const button of conditionButtons) {
      const active = Boolean(s.states[button.dataset.conditionState]);
      button.classList.toggle("active", active);
      const icon = button.querySelector("i");
      if (icon) {
        const state = button.dataset.conditionState;
        if (state === "dying" || state === "temporaryInsanity") {
          icon.className = active ? "fa-solid fa-circle" : "fa-regular fa-circle";
        } else {
          icon.className = `fa-solid ${active ? "fa-toggle-on" : "fa-toggle-off"}`;
        }
      }
    }

    // These elements are conditionally rendered by Handlebars, so keep their
    // visibility synchronized when the Actor is updated with render:false.
    const insanityWarning = root.querySelector(".insanity-warning");
    if (insanityWarning) insanityWarning.hidden = !s.states.temporaryInsanity;
    const insanityEnd = root.querySelector(".condition-end");
    if (insanityEnd) insanityEnd.hidden = !s.states.temporaryInsanity;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.actor.system;
    const items = this.actor.items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      img: item.img,
      system: item.system,
      isWeapon: item.type === "weapon",
      weaponTypeLabel: item.type === "weapon" ? (item.system.weaponType === "firearm" ? "Arma de fogo" : "Arma branca") : "Equipamento",
      weaponIcon: item.type === "weapon" ? (item.system.weaponType === "firearm" ? "fa-solid fa-gun" : "fa-solid fa-knife") : "",
      carried: item.system.carried,
      damage: item.type === "weapon" ? item.system.damage : ""
    }));
    const hpPips = Array.from({ length: s.hp.max }, (_, i) => ({ filled: i < s.hp.value }));
    const sanityPips = Array.from({ length: s.sanity.max }, (_, i) => ({ filled: i < s.sanity.value }));
    const anchorFates = [
      { value: "", label: "Escolha o destino...", selected: s.anchorFate === "" },
      { value: "career-end", label: "Fim de carreira", selected: s.anchorFate === "career-end" },
      { value: "last-consequences", label: "Até às últimas consequências", selected: s.anchorFate === "last-consequences" }
    ];
    const states = [
      { key: "dying", label: "Morrendo", active: s.states.dying, tone: "red" },
      { key: "debilitated", label: "Debilitado", active: s.states.debilitated, tone: "gold" },
      { key: "temporaryInsanity", label: "Insanidade Temporária", active: s.states.temporaryInsanity, tone: "green" },
      { key: "adrift", label: "À Deriva", active: s.states.adrift, tone: "red" }
    ];
    const examples = {
      specialization: ["Arqueólogo", "Astrônomo", "Biólogo", "Criminoso", "Detetive Particular", "Diletante", "Engenheiro", "Hacker", "Jornalista", "Lutador", "Mecânico", "Médico", "Padre", "Químico", "Soldado"],
      impulses: {
        virtue: ["Curioso", "Corajoso", "Altruísta", "Aventureiro", "Implacável"],
        flaw: ["Obsessivo", "Paranóico", "Viciado em adrenalina", "Ambicioso"],
        trauma: ["Um amigo que desapareceu", "Um crime na família nunca solucionado", "Alguém querido com doença misteriosa"]
      },
      anchor: ["Cônjuge", "Filhos", "Pais idosos", "Uma grande amizade", "Um animal de estimação", "Uma carreira promissora"]
    };
    return {
      ...context,
      actor: this.actor,
      system: s,
      editable: this.isEditable,
      items,
      inventoryItems: items.filter(item => item.type === "equipment"),
      weaponItems: items.filter(item => item.type === "weapon").map(item => ({
        ...item,
        dangerLabel: item.damage === "1d6" ? "Baixa" : item.damage === "2d6" ? "Média" : item.damage === "3d6" ? "Alta" : "Altíssima",
        dangerTone: item.damage === "1d6" ? "low" : item.damage === "2d6" ? "medium" : item.damage === "3d6" ? "high" : "extreme"
      })),
      hpPips,
      sanityPips,
      anchorFates,
      states,
      insanityActive: s.states.temporaryInsanity,
      anchorLost: s.states.anchorLost,
      actorName: this.actor.name,
      examples
    };
  }

  static async #test(event, target) {
    const modifier = Number(target.dataset.modifier || 0);
    await rollTest(this.actor, { modifier });
  }

  static async #specialistTest(event, target) {
    const modifier = Number(target.dataset.modifier || 0);
    await rollTest(this.actor, { specialist: true, modifier });
  }

  static async #damage(event, target) {
    await rollDamage(target.dataset.formula, target.dataset.label || "Dano", this.actor);
  }

  static async #sanityShock(event, target) {
    const formula = target.dataset.formula;
    const roll = await new Roll(formula).evaluate();
    const value = Math.max(0, this.actor.system.sanity.value - roll.total);
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${target.dataset.label} · Perda de Sanidade` });
    await this.actor.update({ "system.sanity.value": value }, { render: false });
  }

  static async #temporaryInsanity() {
    const roll = await new Roll("2d6").evaluate();
    const result = INSANITY[roll.total];
    await this.actor.update({ "system.states.temporaryInsanity": true }, { render: false });
    const content = `
      <div class="ci-chat-card ci-insanity-card">
        <div class="ci-insanity-banner"><i class="fa-solid fa-brain"></i><span>INSANIDADE TEMPORÁRIA</span></div>
        <div class="ci-insanity-roll"><span>Resultado da rolagem</span><strong>${roll.total}</strong><small>2d6</small></div>
        <div class="ci-insanity-consequence">${result}</div>
        <div class="ci-insanity-rules">
          <div><i class="fa-regular fa-clock"></i><span>Duração</span><strong>1d6 minutos</strong></div>
          <div><i class="fa-solid fa-arrow-down"></i><span>Testes</span><strong>-2 em Testes</strong></div>
        </div>
      </div>`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content });
  }

  static async #frenzy() {
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
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `Frenesi Investigativo · ${roll.total} dias`, content });
  }

  static async #recoverHP() {
    await this.actor.update({ "system.hp.value": Math.min(this.actor.system.hp.max, this.actor.system.hp.value + 1) }, { render: false });
  }

  static async #recoverSanity() {
    if (this.actor.system.states.adrift) return ui.notifications.warn("Investigadores à deriva não recuperam PdS.");
    await this.actor.update({ "system.sanity.value": Math.min(this.actor.system.sanity.max, this.actor.system.sanity.value + 1) }, { render: false });
  }

  static async #clearInsanity() {
    if (this.actor.system.sanity.value === 0) {
      return ui.notifications.warn("A Insanidade Temporária permanece ativa enquanto os PdS estiverem em 0.");
    }
    await this.actor.update({ "system.states.temporaryInsanity": false }, { render: false });
  }

  static async #toggleState(event, target) {
    const key = target.dataset.state;
    if (!key) return;
    if (key === "dying") {
      return ui.notifications.warn("Morrendo é uma condição automática e só muda quando os PV chegam a 0 ou saem de 0.");
    }
    if (key === "temporaryInsanity") {
      return ui.notifications.warn("Insanidade Temporária é determinada automaticamente pelos Pontos de Sanidade.");
    }
    if (key === "debilitated") {
      if (!this.actor.system.states.debilitated) {
        return ui.notifications.warn("Debilitado é aplicado automaticamente quando Morrendo é encerrado.");
      }
    }
    const current = Boolean(this.actor.system.states[key]);
    await this.actor.update({ [`system.states.${key}`]: !current }, { render: false });
  }

  static async #createEquipment() {
    this.#rememberViewState();
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{
      name: "Novo equipamento",
      type: "equipment",
      system: { quantity: 1, carried: true, evidence: false }
    }], { render: false });
    await item.sheet.render({ force: true });
  }

  static async #createWeapon() {
    this.#rememberViewState();
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{
      name: "Nova arma",
      type: "weapon",
      system: { carried: true, evidence: false, weaponType: "firearm", damage: "1d6" }
    }], { render: false });
    await item.sheet.render({ force: true });
  }

  static async #editItem(event, target) {
    this.#rememberViewState();
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await item.sheet.render({ force: true });
  }

  static async #deleteItem(event, target) {
    this.#rememberViewState();
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await item.delete({ render: false });
    await this.refreshPreservingView();
  }

  static async #toggleCarried(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await item.update({ "system.carried": !item.system.carried }, { render: false });
  }

  static async #toggleEvidence(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await item.update({ "system.evidence": !item.system.evidence }, { render: false });
  }

  static async #useWeapon(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "weapon") return;
    await rollDamage(item.system.damage, `${item.name} · ${item.system.damage}`, this.actor);
  }

  static async #showExamples(event, target) {
    const type = target.dataset.examples;
    const root = this.element;
    const panel = root?.querySelector(`.ci-examples-popover[data-examples-panel="${type}"]`);
    if (panel) panel.hidden = !panel.hidden;
  }

  static async #announceOrder() {
    const message = `
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
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: message });
  }
}
