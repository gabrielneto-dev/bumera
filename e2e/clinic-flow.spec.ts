import { expect, type Page, test } from "@playwright/test";

const BASE_URL = "http://localhost:3100";
const TIME_ZONE = "America/Sao_Paulo";
const PASSWORD = "senha-forte-e2e-123";
const ADMIN_EMAIL = "marina.admin@example.com";
const SECRETARY_EMAIL = "sonia.secretaria@example.com";
const DAY_MS = 86_400_000;

/** Next Monday-to-Saturday day (the dentist's default week), as YYYY-MM-DD in the clinic's timezone. */
function nextWorkingDay(): string {
  const date = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(value);
  const weekday = (value: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(value);
  let candidate = new Date(Date.now() + DAY_MS);
  while (weekday(candidate) === "Sun") candidate = new Date(candidate.getTime() + DAY_MS);
  return date(candidate);
}

async function signUp(page: Page, name: string, email: string) {
  await page.getByLabel("Seu nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

test("a clinic is set up, books an appointment and brings a secretary in by invitation", async ({ page, browser }) => {
  const day = nextWorkingDay();
  let bookedTime = "";

  await test.step("the administrator creates an account and a clinic", async () => {
    await page.goto("/sign-up");
    await signUp(page, "Dra. Marina", ADMIN_EMAIL);
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel("Nome da clínica").fill("Clínica Sorriso E2E");
    await page.getByRole("button", { name: "Cadastrar clínica" }).click();
    await expect(page).toHaveURL(/\/agenda/);
    await expect(page.getByText("Clínica Sorriso E2E")).toBeVisible();
    await expect(page.getByText("Para agendar, cadastre ao menos um dentista e um procedimento.")).toBeVisible();
  });

  await test.step("registers a dentist and a procedure", async () => {
    await page.goto("/dentistas");
    await page.getByRole("button", { name: "Novo dentista" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Dra. Ana Paula");
    await dialog.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText("Dra. Ana Paula")).toBeVisible();

    await page.goto("/procedimentos");
    await page.getByRole("button", { name: "Novo procedimento" }).click();
    await page.getByRole("dialog").getByLabel("Nome").fill("Limpeza");
    await page.getByRole("dialog").getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText("Limpeza")).toBeVisible();
  });

  await test.step("registers a patient, keeping what was typed when the CPF is wrong", async () => {
    await page.goto("/pacientes");
    await page.getByRole("button", { name: "Novo paciente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome completo").fill("Maria Souza");
    await dialog.getByLabel("Telefone (WhatsApp)").fill("(11) 98765-4321");
    await dialog.getByLabel("CPF (opcional)").fill("123.456.789-00");
    await dialog.getByRole("button", { name: "Cadastrar" }).click();
    await expect(dialog.getByText("CPF inválido")).toBeVisible();
    await expect(dialog.getByLabel("Nome completo")).toHaveValue("Maria Souza");

    await dialog.getByLabel("CPF (opcional)").fill("529.982.247-25");
    await dialog.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText("Maria Souza")).toBeVisible();
    await expect(page.getByText("***.***.***-25")).toBeVisible();
  });

  await test.step("refuses a second patient with the same CPF", async () => {
    await page.getByRole("button", { name: "Novo paciente" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome completo").fill("Outra Pessoa");
    await dialog.getByLabel("Telefone (WhatsApp)").fill("(11) 91234-5678");
    await dialog.getByLabel("CPF (opcional)").fill("52998224725");
    await dialog.getByRole("button", { name: "Cadastrar" }).click();
    await expect(dialog.getByText("Já existe um paciente com este CPF nesta clínica")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
  });

  await test.step("books an appointment from the free slots and the slot is no longer offered", async () => {
    await page.goto(`/agenda?dia=${day}`);
    await page.getByRole("button", { name: "Nova consulta" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Paciente").selectOption({ label: "Maria Souza · (11) 98765-4321" });
    await dialog.getByLabel("Dentista").selectOption({ label: "Dra. Ana Paula" });
    await dialog.getByLabel("Procedimento").selectOption({ label: "Limpeza (30 min)" });
    const slots = dialog.getByLabel("Horário");
    await expect(slots.locator("option")).not.toHaveCount(1);
    await slots.selectOption({ index: 1 });
    bookedTime = (await slots.locator("option:checked").textContent()) ?? "";
    expect(bookedTime).toMatch(/^\d{2}:\d{2}$/);
    await dialog.getByRole("button", { name: "Agendar" }).click();

    await expect(page.getByText("Maria Souza")).toBeVisible();
    await expect(page.getByText("Agendada")).toBeVisible();

    await page.getByRole("button", { name: "Nova consulta" }).click();
    const again = page.getByRole("dialog");
    await again.getByLabel("Dentista").selectOption({ label: "Dra. Ana Paula" });
    await again.getByLabel("Procedimento").selectOption({ label: "Limpeza (30 min)" });
    await expect(again.getByLabel("Horário").locator("option")).not.toHaveCount(1);
    await expect(again.getByLabel("Horário").locator("option", { hasText: bookedTime })).toHaveCount(0);
    await again.getByRole("button", { name: "Cancelar" }).click();
  });

  await test.step("confirms the appointment", async () => {
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Confirmada")).toBeVisible();
  });

  await test.step("verifies the e-mail with the code shown on screen", async () => {
    await page.getByRole("button", { name: "Verificar agora" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Mostrar o código" }).click();
    const code = (await dialog.getByText(/^\d{6}$/).textContent()) ?? "";
    await dialog.getByLabel("Digite o código").fill("000000");
    await dialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(dialog.getByText("Código inválido ou expirado")).toBeVisible();
    await dialog.getByLabel("Digite o código").fill(code);
    await dialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Seu e-mail ainda não foi verificado.")).toHaveCount(0);
  });

  let inviteLink = "";
  await test.step("invites a secretary and gets the link on screen", async () => {
    await page.goto("/equipe");
    await page.getByRole("button", { name: "Convidar pessoa" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("E-mail da pessoa").fill(SECRETARY_EMAIL);
    await dialog.getByLabel("Perfil").selectOption({ label: "Secretária" });
    await dialog.getByRole("button", { name: "Criar convite" }).click();
    inviteLink = await dialog.getByLabel("Link do convite").inputValue();
    expect(inviteLink).toContain("/convite/");
    await dialog.getByRole("button", { name: "Concluir" }).click();
    await expect(page.getByText(SECRETARY_EMAIL)).toBeVisible();
  });

  await test.step("the secretary joins through the link and only sees what her role allows", async () => {
    const context = await browser.newContext({ baseURL: BASE_URL, locale: "pt-BR", timezoneId: TIME_ZONE });
    const secretary = await context.newPage();
    await secretary.goto(inviteLink);
    await secretary.getByRole("link", { name: "Criar conta" }).click();
    await signUp(secretary, "Sônia Secretária", SECRETARY_EMAIL);
    await expect(secretary.getByText("Clínica Sorriso E2E")).toBeVisible();
    await secretary.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(secretary).toHaveURL(/\/agenda/);

    await expect(secretary.getByRole("link", { name: "Pacientes" })).toBeVisible();
    await expect(secretary.getByRole("link", { name: "Dentistas" })).toHaveCount(0);
    await expect(secretary.getByRole("link", { name: "Equipe" })).toHaveCount(0);

    await secretary.goto(`/agenda?dia=${day}`);
    await expect(secretary.getByText("Maria Souza")).toBeVisible();
    await secretary.goto("/equipe");
    await expect(secretary).toHaveURL(/\/agenda/);
    await expect(secretary.getByText("Seu perfil não tem acesso a essa página")).toBeVisible();
    await context.close();
  });
});
