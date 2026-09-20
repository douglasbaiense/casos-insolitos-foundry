import { InvestigatorDataModel, NPCDataModel, EquipmentDataModel, AbilityDataModel, WeaponDataModel } from "./data-models.mjs";
import { InvestigatorSheet } from "./actor-sheet.mjs";
import { NPCSheet } from "./npc-sheet.mjs";
import { CasosItemSheet } from "./item-sheet.mjs";
import { openNarratorResources } from "./narrator-resources.mjs";

Hooks.once("init", () => {
  // Expose the narrator tools through the system namespace so macros can
  // invoke them without relying on browser module-specifier resolution.
  game.casosInsolitos = {
    ...(game.casosInsolitos ?? {}),
    openNarratorResources
  };

  CONFIG.Actor.dataModels = {
    ...CONFIG.Actor.dataModels,
    investigador: InvestigatorDataModel,
    npc: NPCDataModel
  };
  CONFIG.Item.dataModels = {
    ...CONFIG.Item.dataModels,
    equipment: EquipmentDataModel,
    weapon: WeaponDataModel,
    ability: AbilityDataModel
  };

  CONFIG.Actor.trackableAttributes = {
    ...CONFIG.Actor.trackableAttributes,
    investigador: { bar: ["hp", "sanity"], value: [] },
    npc: { bar: ["hp", "sanity"], value: [] }
  };

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, game.system.id, InvestigatorSheet, {
    types: ["investigador"],
    makeDefault: true,
    label: "Casos Insólitos — Ficha do Investigador"
  });
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, game.system.id, NPCSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "Casos Insólitos — Ficha de NPC"
  });
  DocumentSheetConfig.registerSheet(foundry.documents.Item, game.system.id, CasosItemSheet, {
    types: ["equipment", "weapon", "ability"],
    makeDefault: true,
    label: "Casos Insólitos — Item"
  });
});

/**
 * Keep automatic conditions synchronized with the resource values.
 * The transition is applied to the same update that changed the resource,
 * avoiding recursive updates and duplicate chat notices.
 */
Hooks.on("preUpdateActor", (actor, changes, options) => {
  if (actor.type !== "investigador" && actor.type !== "npc") return;

  const hpChange = foundry.utils.getProperty(changes, "system.hp.value");
  const sanityChange = foundry.utils.getProperty(changes, "system.sanity.value");
  const currentHP = Number(actor.system.hp.value ?? 0);
  const currentSanity = Number(actor.system.sanity.value ?? 0);

  if (hpChange !== undefined) {
    const hp = Math.max(0, Math.min(Number(actor.system.hp.max ?? 0), Number(hpChange) || 0));
    foundry.utils.setProperty(changes, "system.hp.value", hp);
    const wasDying = Boolean(actor.system.states.dying);
    const shouldBeDying = hp === 0;
    foundry.utils.setProperty(changes, "system.states.dying", shouldBeDying);

    // Leaving Morrendo automatically applies Debilitado once, if not already active.
    if (wasDying && !shouldBeDying && !actor.system.states.debilitated) {
      foundry.utils.setProperty(changes, "system.states.debilitated", true);
      options.ciApplyDebilitated = true;
    }
  }

  if (sanityChange !== undefined) {
    let sanity = Math.max(0, Math.min(Number(actor.system.sanity.max ?? 0), Number(sanityChange) || 0));
    if (actor.system.states.adrift && sanity > currentSanity) sanity = currentSanity;
    foundry.utils.setProperty(changes, "system.sanity.value", sanity);

    const shouldBeInsane = sanity === 0;
    foundry.utils.setProperty(changes, "system.states.temporaryInsanity", shouldBeInsane);
    // Only trigger the automatic roll on the transition from >0 to exactly 0.
    if (currentSanity > 0 && sanity === 0) options.ciTriggerInsanity = true;
  }

  // Morrendo and Insanidade Temporária are read-only conditions.
  // Ignore any attempt to set them directly and derive them from resources instead.
  if (foundry.utils.hasProperty(changes, "system.states.dying") && hpChange === undefined) {
    foundry.utils.setProperty(changes, "system.states.dying", currentHP === 0);
  }
  if (foundry.utils.hasProperty(changes, "system.states.temporaryInsanity") && sanityChange === undefined) {
    foundry.utils.setProperty(changes, "system.states.temporaryInsanity", currentSanity === 0);
  }
});

Hooks.on("updateActor", async (actor, changed, options) => {
  if (actor.type !== "investigador" && actor.type !== "npc") return;

  // Sync the visible sheet immediately after every Actor update, including
  // updates made with render:false. This keeps conditions visually in sync
  // without resetting the current tab or scroll position.
  if (actor.sheet?.syncVisualState) actor.sheet.syncVisualState();

  if (actor.type === "investigador" && options.ciApplyDebilitated) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="ci-chat-card ci-condition-card ci-debilitated-card">
          <div class="ci-condition-kicker">CONDIÇÃO APLICADA</div>
          <div class="ci-condition-title"><i class="fa-solid fa-kit-medical"></i> DEBILITADO</div>
          <p>O Investigador deixou a condição <strong>Morrendo</strong> e agora está <strong>Debilitado</strong>.</p>
          <div class="ci-condition-rule">Atividades muito extenuantes ou estressantes exigem um Teste. Em caso de falha, recebe 1 ponto de dano.</div>
        </div>`
    });
  }

  if (actor.type === "investigador" && options.ciTriggerInsanity) {
    const roll = await new Roll("2d6").evaluate();
    const result = {
      2: "Surto de violência contra alguém próximo", 3: "Foge em pânico", 4: "Desmaio",
      5: "Cegueira psicossomática", 6: "Estupor", 7: "Tiques e tremores incontroláveis",
      8: "Alucinações", 9: "Disartria — não consegue falar", 10: "Riso histérico", 11: "Choro compulsivo", 12: "Narrador assume o controle"
    }[roll.total];
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="ci-chat-card ci-insanity-card">
          <div class="ci-insanity-banner"><i class="fa-solid fa-brain"></i><span>INSANIDADE TEMPORÁRIA</span></div>
          <div class="ci-insanity-roll"><span>Resultado da rolagem</span><strong>${roll.total}</strong><small>2d6</small></div>
          <div class="ci-insanity-consequence">${result}</div>
          <div class="ci-insanity-rules">
            <div><i class="fa-regular fa-clock"></i><span>Duração</span><strong>1d6 minutos</strong></div>
            <div><i class="fa-solid fa-arrow-down"></i><span>Testes</span><strong>-2 em Testes</strong></div>
          </div>
        </div>`
    });
  }
});

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;
  const name = "Recursos do Narrador";
  const command = "await game.casosInsolitos.openNarratorResources();";
  try {
    const existing = game.macros?.getName(name);
    if (existing) {
      // Update the standard system macro so worlds created with v1.0.0
      // no longer retain the invalid bare module specifier.
      if (existing.command !== command) await existing.update({ command });
      return;
    }

    await Macro.create({
      name,
      type: "script",
      img: "icons/svg/book.svg",
      command,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
    });
    ui.notifications.info("Macro padrão criada: Recursos do Narrador.");
  } catch (error) {
    console.error("Casos Insólitos | Não foi possível criar a macro Recursos do Narrador.", error);
  }
});

Hooks.once("ready", () => console.log("Casos Insólitos | Sistema v1.0.2 carregado"));
