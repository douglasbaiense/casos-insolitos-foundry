function speaker(actor) {
  return actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker();
}

export async function rollTest(actor, { specialist = false, modifier = 0 } = {}) {
  const insanityPenalty = actor?.system?.states?.temporaryInsanity ? -2 : 0;
  const effectiveModifier = modifier + insanityPenalty;
  const base = specialist ? "4d6kh2" : "2d6";
  const formula = effectiveModifier === 0
    ? base
    : `${base} ${effectiveModifier >= 0 ? "+" : "-"} ${Math.abs(effectiveModifier)}`;
  const roll = await new Roll(formula).evaluate();
  const total = roll.total;
  const difficulty = 9;
  const success = total >= difficulty;
  const type = specialist ? "Teste de Especialização" : "Teste Padrão";
  const resultLabel = success ? "SUCESSO" : "FALHA";
  const insanityDetail = insanityPenalty
    ? `<div class="ci-test-penalty"><i class="fa-solid fa-brain"></i> Penalidade de Insanidade Temporária: <strong>-2</strong> aplicada</div>`
    : "";

  const content = `
    <div class="ci-chat-card ci-test-card ${success ? "success" : "failure"}">
      <div class="ci-chat-result">${resultLabel}</div>
      <div class="ci-chat-title">${type}</div>
      <div class="ci-chat-roll"><strong>${total}</strong><span>contra ${difficulty}</span></div>
      <div class="ci-chat-detail">Rolagem: ${base}</div>
      ${insanityDetail}
    </div>`;

  await roll.toMessage({ speaker: speaker(actor), flavor: `${type} · ${resultLabel}`, content });
  return { roll, success, insanityPenalty };
}

export async function rollDamage(formula, flavor, actor = null) {
  const baseDice = Number(formula.match(/^(\d+)d6/)?.[1] ?? 1);
  // A 6 explodes recursively, as specified by the damage rule.
  const exploding = formula.replace(/(\d+)d6/, "$1d6x");
  const roll = await new Roll(exploding).evaluate();
  const resultCount = roll.dice.reduce((sum, die) => sum + die.results.length, 0);
  const aggravated = resultCount > baseDice;
  const tone = baseDice === 1 ? "low" : baseDice === 2 ? "medium" : baseDice === 3 ? "high" : "extreme";
  const label = baseDice === 1 ? "Baixa periculosidade" : baseDice === 2 ? "Média periculosidade" : baseDice === 3 ? "Alta periculosidade" : "Altíssima periculosidade";

  const content = `
    <div class="ci-chat-card ci-damage-card damage-${tone}">
      <div class="ci-damage-heading">
        <div><span class="ci-damage-label">${label}</span><strong>${flavor}</strong></div>
        <div class="ci-damage-total">${roll.total}</div>
      </div>
      <div class="ci-chat-detail">${roll.formula}</div>
      ${aggravated ? '<div class="ci-aggravated">AGRAVADO</div>' : ''}
    </div>`;

  await roll.toMessage({
    speaker: speaker(actor),
    flavor: `${flavor} · ${roll.total}${aggravated ? " · AGRAVADO" : ""}`,
    content
  });
  return { roll, aggravated };
}
