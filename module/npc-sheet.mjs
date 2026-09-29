import { rollDamage } from "./dice.mjs";
import { htmlToPlainText, customItemImg } from "./item-sheet.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class NPCSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["casos-insolitos", "npc-sheet"],
    position: { width: 1080, height: 820 },
    window: { icon: "fa-solid fa-skull", resizable: true },
    form: { closeOnSubmit: false, submitOnChange: false },
    actions: {
      test: NPCSheet.#test,
      specialistTest: NPCSheet.#specialistTest,
      damage: NPCSheet.#damage,
      sanityShock: NPCSheet.#sanityShock,
      presenceShock: NPCSheet.#presenceShock,
      recoverHP: NPCSheet.#recoverHP,
      recoverSanity: NPCSheet.#recoverSanity,
      createEquipment: NPCSheet.#createEquipment,
      createWeapon: NPCSheet.#createWeapon,
      createAbility: NPCSheet.#createAbility,
      editItem: NPCSheet.#editItem,
      deleteItem: NPCSheet.#deleteItem,
      useAbility: NPCSheet.#useAbility,
      useWeapon: NPCSheet.#useWeapon
    }
  };

  get title() {
    return `NPC: ${this.actor.name}`;
  }

  static PARTS = {
    header: { template: "systems/casos-insolitos/templates/npc-header.hbs" },
    content: { template: "systems/casos-insolitos/templates/npc-content.hbs" },
    footer: { template: "systems/casos-insolitos/templates/actor-footer.hbs" }
  };

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    for (const button of root.querySelectorAll("[data-tab-target]")) {
      button.addEventListener("click", () => this.#activateTab(button.dataset.tabTarget));
    }

    for (const input of root.querySelectorAll("[name]")) {
      if (input.closest(".ci-item-form")) continue;
      input.addEventListener("change", async (event) => {
        const field = event.currentTarget.name;
        if (!field) return;
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

  rememberViewState() { this.#rememberViewState(); }

  async refreshPreservingView() {
    this.#rememberViewState();
    await this.render({ force: true });
  }

  #activateTab(tab) {
    const root = this.element;
    if (!root) return;
    for (const b of root.querySelectorAll("[data-tab-target]")) b.classList.toggle("active", b.dataset.tabTarget === tab);
    for (const panel of root.querySelectorAll("[data-tab-panel]")) panel.classList.toggle("active", panel.dataset.tabPanel === tab);
    this._ciActiveTab = tab;
  }

  #rememberViewState() {
    const root = this.element;
    if (!root) return;
    const active = root.querySelector("[data-tab-target].active")?.dataset.tabTarget;
    if (active) this._ciActiveTab = active;
    this._ciScrollTop = {};
    for (const panel of root.querySelectorAll("[data-tab-panel]")) this._ciScrollTop[panel.dataset.tabPanel] = panel.scrollTop;
  }

  #restoreViewState() {
    const root = this.element;
    if (!root) return;
    this.#activateTab(this._ciActiveTab || "npc");
    requestAnimationFrame(() => {
      for (const panel of root.querySelectorAll("[data-tab-panel]")) {
        const value = this._ciScrollTop?.[panel.dataset.tabPanel];
        if (Number.isFinite(value)) panel.scrollTop = value;
      }
    });
  }

  async #updateActorField(input, field) {
    let value = input.type === "checkbox" ? input.checked : input.value;
    if (field === "system.hp.value" || field === "system.sanity.value") {
      const key = field.includes("hp") ? "hp" : "sanity";
      value = Math.max(0, Math.min(this.actor.system[key].max, Number(value || 0)));
      input.value = value;
    }
    this.#rememberViewState();
    await this.actor.update({ [field]: value }, { render: false });
    this.syncVisualState();
  }

  syncVisualState() {
    const root = this.element;
    if (!root) return;
    const s = this.actor.system;
    for (const [key, value, max] of [["hp", s.hp.value, s.hp.max], ["sanity", s.sanity.value, s.sanity.max]]) {
      const card = root.querySelector(`.${key === "hp" ? "hp-card" : "sanity-card"}`);
      if (!card) continue;
      const input = card.querySelector(`input[name="system.${key}.value"]`);
      if (input) input.value = value;
      const counter = card.querySelector(".resource-counter");
      if (counter) counter.textContent = `${value} / ${max}`;
      card.querySelectorAll(".pip").forEach((pip, index) => pip.classList.toggle("filled", index < value));
    }
    const dying = root.querySelector('[data-condition-state="dying"]');
    if (dying) {
      const active = Boolean(s.states.dying);
      dying.classList.toggle("active", active);
      const icon = dying.querySelector("i");
      if (icon) icon.className = active ? "fa-solid fa-circle" : "fa-regular fa-circle";
    }
    const insanity = root.querySelector('[data-condition-state="temporaryInsanity"]');
    if (insanity) {
      const active = Boolean(s.states.temporaryInsanity);
      insanity.classList.toggle("active", active);
      const icon = insanity.querySelector("i");
      if (icon) icon.className = active ? "fa-solid fa-circle" : "fa-regular fa-circle";
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.actor.system;
    const items = this.actor.items.map(item => ({
      id: item.id, name: item.name, type: item.type, img: item.img, customImg: customItemImg(item), descriptionPreview: htmlToPlainText(item.system.description), system: item.system,
      isWeapon: item.type === "weapon", isAbility: item.type === "ability",
      weaponTypeLabel: item.type === "weapon" ? (item.system.weaponType === "firearm" ? "Arma de fogo" : "Arma branca") : "",
      weaponIcon: item.type === "weapon" ? (item.system.weaponType === "firearm" ? "fa-solid fa-gun" : "fa-solid fa-knife") : "",
      damage: item.system.damage || ""
    }));
    const hpPips = Array.from({ length: s.hp.max }, (_, i) => ({ filled: i < s.hp.value }));
    const sanityPips = Array.from({ length: s.sanity.max }, (_, i) => ({ filled: i < s.sanity.value }));
    const presenceOptions = [
      ["mundane", "Mundano — não causa perda de Sanidade"],
      ["forte", "Abalo Forte — 1d6 PdS"],
      ["profundo", "Abalo Profundo — 2d6 PdS"],
      ["devastador", "Abalo Devastador — 3d6 PdS"]
    ].map(([value, label]) => ({ value, label, selected: s.presence === value }));
    const presenceFormula = { mundane: null, forte: "1d6", profundo: "2d6", devastador: "3d6" }[s.presence] || null;
    const presenceLabel = { mundane: "Mundano", forte: "Abalo Forte", profundo: "Abalo Profundo", devastador: "Abalo Devastador" }[s.presence] || "Mundano";
    const sanityResistanceOptions = [
      ["mundano", "Mundano — Sofre Abalos normalmente."],
      ["iniciado", "Iniciado — Sofre Abalos Profundos ou maiores."],
      ["cultista", "Cultista — Sofre apenas Abalos Devastadores."],
      ["insolito", "Insólito — Não se abala com nada."]
    ].map(([value, label]) => ({ value, label, selected: s.sanityResistance === value }));
    const damageResistanceOptions = [
      ["mundano", "Mundano — Sofre dano normalmente."],
      ["resistente", "Resistente — Ignora danos abaixo de Alta Periculosidade e é imune a Agravantes. Qualquer dano recebido será considerado Baixa Periculosidade (1d6)."],
      ["insolito", "Insólito — Ignora danos abaixo de Altíssima Periculosidade e é imune a Agravantes. Qualquer dano recebido será considerado Baixa Periculosidade (1d6)."],
      ["insolito-anciao", "Insólito Ancião — Ignora todo e qualquer dano. Alguns podem ser feridos em situações especiais."]
    ].map(([value, label]) => ({ value, label, selected: s.damageResistance === value }));
    return {
      ...context, actor: this.actor, system: s, editable: this.isEditable, items,
      inventoryItems: items.filter(item => item.type === "equipment"),
      weaponItems: items.filter(item => item.type === "weapon").map(item => ({
        ...item,
        dangerLabel: { "1d6": "1d6 — Baixa Periculosidade", "2d6": "2d6 — Média Periculosidade", "3d6": "3d6 — Alta Periculosidade", "4d6": "4d6 — Altíssima Periculosidade" }[item.damage] || "1d6 — Baixa Periculosidade",
        dangerTone: { "1d6": "low", "2d6": "medium", "3d6": "high", "4d6": "extreme" }[item.damage] || "low"
      })),
      abilityItems: items.filter(item => item.type === "ability").map(item => ({
        ...item,
        abilityTypeLabel: { item: "Item", ritual: "Ritual", power: "Poder" }[item.system.abilityType] || "Item",
        targetLabel: { self: "Próprio", adjacent: "Adjacente", distant: "Distante" }[item.system.target] || "Próprio",
        dangerLabel: { "0": "0 — Sem Dano", "1d6": "1d6 — Baixa Periculosidade", "2d6": "2d6 — Média Periculosidade", "3d6": "3d6 — Alta Periculosidade", "4d6": "4d6 — Altíssima Periculosidade" }[item.system.damage] || "0 — Sem Dano",
        dangerTone: item.system.damage === "0" ? "none" : ({ "1d6": "low", "2d6": "medium", "3d6": "high", "4d6": "extreme" }[item.system.damage] || "none")
      })),
      hpPips, sanityPips, presenceOptions, presenceFormula, presenceLabel, sanityResistanceOptions, damageResistanceOptions
    };
  }

  static async #test() { const { rollTest } = await import("./dice.mjs"); await rollTest(this.actor); }
  static async #specialistTest() { const { rollTest } = await import("./dice.mjs"); await rollTest(this.actor, { specialist: true }); }
  static async #damage(event, target) { await rollDamage(target.dataset.formula, target.dataset.label || "Dano", this.actor); }
  static async #presenceShock() {
    const formula = { mundane: null, forte: "1d6", profundo: "2d6", devastador: "3d6" }[this.actor.system.presence] || null;
    const label = { mundane: "Mundano", forte: "Abalo Forte", profundo: "Abalo Profundo", devastador: "Abalo Devastador" }[this.actor.system.presence] || "Mundano";
    if (!formula) {
      const content = `
        <div class="ci-chat-card ci-presence-card presence-none">
          <div class="ci-presence-heading">
            <div><span class="ci-presence-kicker">PRESENÇA INSÓLITA</span><strong>${label}</strong></div>
            <div class="ci-presence-total">0</div>
          </div>
          <div class="ci-presence-impact"><i class="fa-solid fa-shield-heart"></i><span>Sem perda de Sanidade</span></div>
        </div>`;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content,
        flavor: `Presença Insólita · ${label} · Sem perda de Sanidade`
      });
      return;
    }
    const roll = await new Roll(formula).evaluate();
    const content = `
      <div class="ci-chat-card ci-presence-card">
        <div class="ci-presence-heading">
          <div><span class="ci-presence-kicker">PRESENÇA INSÓLITA</span><strong>${label}</strong></div>
          <div class="ci-presence-total">${roll.total}</div>
        </div>
        <div class="ci-presence-impact"><i class="fa-solid fa-brain"></i><span>Perda de Sanidade</span><strong>${formula}</strong></div>
        <div class="ci-chat-detail">Rolagem: ${roll.formula}</div>
      </div>`;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `Presença Insólita · ${label} · ${roll.total} PdS`,
      content
    });
  }

  static async #sanityShock(event, target) {
    const roll = await new Roll(target.dataset.formula).evaluate();
    const value = Math.max(0, this.actor.system.sanity.value - roll.total);
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${target.dataset.label} · Perda de Sanidade` });
    await this.actor.update({ "system.sanity.value": value }, { render: false });
  }
  static async #recoverHP() { await this.actor.update({ "system.hp.value": Math.min(this.actor.system.hp.max, this.actor.system.hp.value + 1) }, { render: false }); }
  static async #recoverSanity() { await this.actor.update({ "system.sanity.value": Math.min(this.actor.system.sanity.max, this.actor.system.sanity.value + 1) }, { render: false }); }

  static async #createEquipment() {
    this.#rememberViewState();
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: "Novo equipamento", type: "equipment", system: { quantity: 1, carried: true, evidence: false } }], { render: false });
    await item.sheet.render({ force: true });
  }
  static async #createWeapon() {
    this.#rememberViewState();
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: "Nova arma", type: "weapon", system: { carried: true, evidence: false, weaponType: "firearm", damage: "1d6" } }], { render: false });
    await item.sheet.render({ force: true });
  }
  static async #createAbility() {
    this.#rememberViewState();
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: "Nova habilidade insólita", type: "ability", system: { abilityType: "power", target: "self", damage: "0", description: "" } }], { render: false });
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
  static async #useWeapon(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "weapon") return;
    await rollDamage(item.system.damage, `${item.name} · ${item.system.damage}`, this.actor);
  }

  static async #useAbility(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || item.type !== "ability") return;
    const damage = item.system.damage || "0";
    if (damage === "0") {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: `<div class="ci-chat-card ci-ability-card"><div class="ci-ability-banner">${item.name}</div><div class="ci-ability-result">Sem Dano</div><p>${item.system.description || ""}</p></div>` });
      return;
    }
    await rollDamage(damage, `${item.name} · ${damage}`, this.actor);
  }
}
