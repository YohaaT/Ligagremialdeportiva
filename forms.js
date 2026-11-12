const contactForms = document.querySelectorAll("[data-contact-form]");

contactForms.forEach((form) => {
  const status = form.querySelector("[data-form-status]");
  const submit = form.querySelector("[type='submit']");
  const startedAt = form.querySelector("[name='startedAt']");
  const submissionId = ensureSubmissionId(form);
  if (startedAt) startedAt.value = String(Date.now());
  setupMembershipFields(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(status, "");

    if (typeof form.lgdValidateBeforeSubmit === "function" && !form.lgdValidateBeforeSubmit()) return;
    prepareMembershipWizardForSubmit(form);
    updateMembershipNumberSummary(form);
    const formData = new FormData(form);
    const payload = formDataToPayload(formData);
    const finalTurnstile = form.querySelector(".cf-turnstile:not([data-lookup-turnstile])");
    payload.turnstileToken = window.turnstile && finalTurnstile ? window.turnstile.getResponse(finalTurnstile) : formData.get("cf-turnstile-response") || "";
    payload.sourcePath = window.location.pathname;

    const isLocalPreview = /^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname);
    if (!payload.turnstileToken && !isLocalPreview) {
      setStatus(status, form.dataset.turnstileMessage || "Completa la verificacion anti-spam.", true);
      return;
    }

    submit.disabled = true;
    form.classList.add("is-sending");
    setStatus(status, form.dataset.sendingMessage || "Enviando solicitud...");

    try {
      const membershipFiles = payload.topic === "membership" && [formData.get("professionalTitleFile"), formData.get("profilePhotoFile")].some((file) => file && typeof file.arrayBuffer === "function" && file.size);
      const requestBody = membershipFiles ? (() => { const data=new FormData(); Object.entries(payload).filter(([key])=>!["professionalTitleFile","profilePhotoFile"].includes(key)).forEach(([key,value])=>data.append(key,Array.isArray(value)?JSON.stringify(value):String(value ?? ""))); ["professionalTitleFile","profilePhotoFile"].forEach((key)=>{const file=formData.get(key);if(file&&typeof file.arrayBuffer==="function"&&file.size)data.append(key,file);}); return data; })() : JSON.stringify(payload);
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: membershipFiles ? undefined : { "Content-Type": "application/json" },
        body: requestBody,
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "No pudimos enviar la solicitud.");
      }

      form.reset();
      if (startedAt) startedAt.value = String(Date.now());
      if (submissionId) submissionId.value = createSubmissionId();
      form.querySelector("[name='membershipType']")?.dispatchEvent(new Event("change"));
      form.querySelector("[name='requestProfile']")?.dispatchEvent(new Event("change"));
      updateMembershipNumberSummary(form);
      if (window.turnstile) window.turnstile.reset(form.querySelector(".cf-turnstile:not([data-lookup-turnstile])"));
      const membershipSuccess = payload.topic === 'membership';
      setStatus(status, membershipSuccess ? (form.dataset.successMessage || 'Registro realizado satisfactoriamente. La Liga se pondrá en contacto contigo.') : (data.message || form.dataset.successMessage || "Solicitud enviada."));
      if (membershipSuccess) {
        form.querySelectorAll('button, input, select, textarea').forEach((control) => { if (control.type !== 'hidden') control.disabled = true; });
        window.setTimeout(() => {
          const target = `${window.location.pathname}${window.location.search}${window.location.hash || (window.location.pathname.includes('community-membership') ? '#membership-form' : '#formulario-afiliacion')}`;
          window.location.replace(target);
        }, 5000);
      }
    } catch (error) {
      setStatus(status, error.message || form.dataset.errorMessage || "No pudimos enviar la solicitud.", true);
    } finally {
      submit.disabled = false;
      form.classList.remove("is-sending");
    }
  });
});

function createSubmissionId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function ensureSubmissionId(form) {
  let input = form.querySelector("[name='submissionId']");
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = "submissionId";
    form.prepend(input);
  }
  if (!input.value) input.value = createSubmissionId();
  return input;
}

function setStatus(node, message, isError = false) {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-error", Boolean(isError));
}

function formDataToPayload(formData) {
  const payload = {};
  formData.forEach((value, key) => {
    if (payload[key] === undefined) {
      payload[key] = value;
      return;
    }
    payload[key] = Array.isArray(payload[key]) ? [...payload[key], value] : [payload[key], value];
  });
  return payload;
}

function setupMembershipFields(form) {
  if (!form.matches("[data-membership-form]")) return;
  setupMembershipCatalogs(form);
  if (form.matches("[data-membership-wizard]")) {
    setupMembershipWizard(form);
    return;
  }

  const typeSelect = form.querySelector("[name='membershipType']");
  const groups = Array.from(form.querySelectorAll(".conditional-fields[data-membership-fields]"));
  const specificFields = Array.from(form.querySelectorAll("[data-membership-only]"));
  const professionSelects = Array.from(form.querySelectorAll("[name='profession']"));
  const otherProfessionSelect = form.querySelector("[name='otherProfessions']");
  const otherDisciplineControls = Array.from(form.querySelectorAll("[name='otherDisciplines']"));
  const professionOtherFields = Array.from(form.querySelectorAll("[data-profession-other]"));
  const membershipNumberFields = form.querySelector("[data-membership-number-fields]");
  const teamQuestion = form.querySelector("[name='participatesInTeam']");
  const teamDetails = form.querySelector("[data-team-details]");
  const birthDate = form.querySelector("[name='birthDate']");
  if (birthDate && !birthDate.max) birthDate.max = new Date().toISOString().slice(0, 10);

  const getSelectedOptions = (select) => select ? Array.from(select.selectedOptions).filter((option) => option.value) : [];

  const getSelectedProfessions = () => {
    const professions = [];
    professionSelects.forEach((select) => {
      if (!select.disabled && select.value) {
        professions.push({ value: select.value, label: select.selectedOptions[0]?.textContent.trim() || select.value });
      }
    });
    getSelectedOptions(otherProfessionSelect).forEach((option) => {
      if (!otherProfessionSelect.disabled) {
        professions.push({ value: option.value, label: option.textContent.trim() || option.value });
      }
    });
    const seen = new Set();
    return professions.filter((profession) => {
      const key = profession.value === "other" ? "other" : profession.value;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const toggleTeamDetails = () => {
    if (!teamDetails || !teamQuestion) return;
    const showDetails = !teamQuestion.disabled && ["yes", "register"].includes(teamQuestion.value);
    teamDetails.classList.toggle("is-hidden", !showDetails);
    teamDetails.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = !showDetails;
      if (control.dataset.required === "true") control.required = showDetails;
    });
  };

  const renderMembershipNumberFields = () => {
    if (!membershipNumberFields) return;
    const selectedProfessions = getSelectedProfessions();
    membershipNumberFields.innerHTML = "";
    selectedProfessions.forEach((profession) => {
      const label = document.createElement("label");
      label.textContent = `Numero de colegiado / registro para ${profession.label}`;
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 80;
      input.dataset.membershipNumberInput = "true";
      input.dataset.professionLabel = profession.label;
      input.placeholder = "Indicar numero o N/A si no aplica";
      input.autocomplete = "off";
      label.appendChild(input);
      membershipNumberFields.appendChild(label);
    });
    updateMembershipNumberSummary(form);
  };

  const toggleProfessionOther = () => {
    const showOther = getSelectedProfessions().some((profession) => profession.value === "other");
    professionOtherFields.forEach((field) => {
      field.classList.toggle("is-hidden", !showOther);
      field.querySelectorAll("input, select, textarea").forEach((control) => {
        control.disabled = !showOther;
        if (control.dataset.required === "true") control.required = showOther;
      });
    });
    renderMembershipNumberFields();
  };

  const toggleGroups = () => {
    const selected = typeSelect ? typeSelect.value : "";
    groups.forEach((group) => {
      const values = (group.dataset.membershipFields || "").split(/\s+/).filter(Boolean);
      const isActive = values.includes(selected);
      group.classList.toggle("is-hidden", !isActive);
      group.querySelectorAll("input, select, textarea").forEach((control) => {
        control.disabled = !isActive;
        if (control.dataset.required === "true") {
          control.required = isActive;
        }
      });
    });
    specificFields.forEach((field) => {
      const values = (field.dataset.membershipOnly || "").split(/\s+/).filter(Boolean);
      const isActive = values.includes(selected);
      field.classList.toggle("is-hidden", !isActive);
      field.querySelectorAll("input, select, textarea").forEach((control) => {
        control.disabled = !isActive;
        if (control.dataset.required === "true") {
          control.required = isActive;
        }
      });
    });
    if (otherProfessionSelect) otherProfessionSelect.disabled = !["institutional-member", "independent"].includes(selected);
    otherDisciplineControls.forEach((control) => {
      control.disabled = !["institutional-member", "independent"].includes(selected);
    });
    toggleProfessionOther();
    toggleTeamDetails();
  };

  if (typeSelect) typeSelect.addEventListener("change", toggleGroups);
  professionSelects.forEach((select) => select.addEventListener("change", toggleProfessionOther));
  if (otherProfessionSelect) otherProfessionSelect.addEventListener("change", toggleProfessionOther);
  if (teamQuestion) teamQuestion.addEventListener("change", toggleTeamDetails);
  if (membershipNumberFields) membershipNumberFields.addEventListener("input", () => updateMembershipNumberSummary(form));
  const preLookup = setupPreRegistrationLookup(form);
  const updateLookup = () => {
    const enabled = ["institutional-member", "independent"].includes(typeSelect?.value);
    if (!enabled) preLookup.clear();
    preLookup.setActive(enabled);
  };
  if (typeSelect) typeSelect.addEventListener("change", updateLookup);
  toggleGroups();
  updateLookup();
}

function setupMembershipCatalogs(form) {
  const identityType=form.querySelector("[name='identityType']");
  const identity=form.querySelector("[name='identityDocument']");
  const university=form.querySelector("[data-university-select]");
  const universityOther=form.querySelector("[data-university-other]");
  const otherInput=universityOther?.querySelector("input");
  const syncIdentity=()=>{
    if(!identity)return;
    const passport=['P','other'].includes(identityType?.value);
    identity.inputMode=passport?'text':'numeric';
    identity.pattern=passport?'[A-Za-z0-9-]{5,20}':'[0-9]{5,12}';
    identity.value=passport?identity.value.replace(/[^a-zA-Z0-9-]/g,'').toUpperCase():identity.value.replace(/\D/g,'');
  };
  const syncOther=()=>{const show=university?.value==='other';universityOther?.classList.toggle('is-hidden',!show);if(otherInput){otherInput.disabled=!show;otherInput.required=show;}};
  identityType?.addEventListener('change',syncIdentity); identity?.addEventListener('input',syncIdentity); university?.addEventListener('change',syncOther); syncIdentity(); syncOther();
  if(!university)return;
  fetch('/api/catalogs/universities',{headers:{Accept:'application/json'}}).then((response)=>response.ok?response.json():null).then((data)=>{
    if(!Array.isArray(data?.universities))return;
    const current=university.value; university.replaceChildren(new Option('Seleccionar',''));
    data.universities.forEach((item)=>university.add(new Option(item.name,item.name)));
    university.add(new Option('Otra / estudios en el exterior','other'));
    university.value=Array.from(university.options).some((option)=>option.value===current)?current:''; syncOther();
  }).catch(()=>{});
}

function updateMembershipNumberSummary(form) {
  if (!form || !form.matches("[data-membership-form]")) return;
  const summary = form.querySelector("[name='membershipNumbersDetail']");
  if (!summary) return;
  const entries = Array.from(form.querySelectorAll("[data-membership-number-input]"))
    .map((input) => {
      const value = input.value.trim();
      return value ? `${input.dataset.professionLabel}: ${value}` : "";
    })
    .filter(Boolean);
  summary.value = entries.join(" | ");
}

function setupPreRegistrationLookup(form) {
  const root = form.querySelector("[data-pre-registration-lookup]");
  if (!root) return { setActive() {}, ensure: async () => true, clear() {} };
  const documentInput = root.querySelector("[name='identityDocument']");
  const birthDate = root.querySelector("[name='birthDate']");
  const tokenInput = form.querySelector("[data-pre-registration-token]");
  const status = root.querySelector("[data-pre-registration-status]");
  const search = root.querySelector("[data-pre-registration-search]");
  const choices = root.querySelector("[data-pre-registration-choices]");
  const extra = root.querySelector("[data-pre-registration-extra]");
  const extraSurname = root.querySelector("[data-pre-registration-last-name]");
  const extraGuild = root.querySelector("[data-pre-registration-guild]");
  const extraDiscipline = root.querySelector("[data-pre-registration-discipline]");
  const extraConfirm = root.querySelector("[data-pre-registration-confirm-b]");
  const details = root.querySelector("[data-pre-registration-details]");
  const turnstileNode = root.querySelector("[data-lookup-turnstile]");
  const english = form.querySelector("[name='language']")?.value === "en";
  const copy = english ? { searching:"Checking your previous registration…", none:"You can continue with a new affiliation request.", found:"We confirmed a previous LGD registration. Complete only the new details.", existing:"There is already an affiliation request associated with these details. It is not necessary to submit another one.", captcha:"Complete the anti-spam verification.", error:"We could not confirm the previous registration.", selectSurname:"Select your last name to continue.", extra:"Confirm your last name, guild and discipline.", birthDate:"Enter your date of birth to continue this verification.", invalid:"We could not confirm those details. You can continue with a new request.", source:"Previous registration confirmed" } : { searching:"Verificando tu pre-registro…", none:"Puedes continuar con una solicitud de afiliación nueva.", found:"Confirmamos un registro previo de LGD. Completa solo los datos nuevos.", existing:"Ya existe una solicitud de afiliación asociada con estos datos. No es necesario enviar otra.", captcha:"Completa la verificación anti-spam.", error:"No pudimos confirmar el pre-registro.", selectSurname:"Selecciona tu apellido para continuar.", extra:"Confirma tu apellido, gremio y disciplina.", birthDate:"Indica tu fecha de nacimiento para continuar esta verificación.", invalid:"No pudimos confirmar esos datos. Puedes continuar con una solicitud nueva.", source:"Pre-registro LGD confirmado" };
  let active = false;
  let campaignAvailable = true;
  const normalizeIdentity = () => String(documentInput?.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^[VE](?=\d{5,}$)/, "");
  const setStatus = (message, error=false) => { if (status) { status.textContent=message; status.classList.toggle("is-error", Boolean(error)); } };
  const reset = () => { if (tokenInput) tokenInput.value=""; delete root.dataset.lookupCompletedFor; delete root.dataset.preRegistrationLookupToken; if (choices) choices.replaceChildren(); if (extra) extra.hidden=true; if (details) { details.hidden=true; details.replaceChildren(); } };
  const setField = (name, value) => { if (!value) return; const control=form.querySelector(`[name="${name}"]`); if (!control) return; if (control.tagName === "SELECT") { const option=Array.from(control.options).find((item)=>String(item.value).toLowerCase()===String(value).toLowerCase() || item.textContent.trim().toLowerCase()===String(value).toLowerCase()); if (option) control.value=option.value; } else control.value=value; };
  const apply = (data) => {
    [["firstName",data.firstName],["lastName",data.lastName],["country",data.country],["regionCity",data.regionCity],["institutionName",data.institutionName],["discipline",data.disciplineLabel],["gender",data.gender],["sportParticipationCategory",data.sportParticipationCategory],["competitionLevel",data.competitionLevel],["athleteStatus",data.athleteStatus],["university",data.university],["graduationYear",data.graduationYear]].forEach(([name,value])=>setField(name,value));
    if (data.institutionName) setField("belongsInstitution","yes");
    root.dataset.lookupCompletedFor=normalizeIdentity();
    form.querySelector("[data-belongs-institution]")?.dispatchEvent(new Event("change",{bubbles:true}));
  };
  const preview = (data) => { if (!details) return; details.hidden=false; details.replaceChildren(); const title=document.createElement("strong"); title.textContent=copy.source; details.append(title); const labels=english?["Name","Last name","Guild","Discipline","Date of birth","Professional registration"]:["Nombre","Apellido","Gremio","Disciplina","Fecha de nacimiento","Registro profesional"]; const fields=[[labels[0],data.firstName],[labels[1],data.lastName],[labels[2],data.institutionName],[labels[3],data.discipline],[labels[4],data.birthDate],[labels[5],data.professionalNumber]].filter(([,v])=>v); fields.forEach(([label,value])=>{const line=document.createElement("span"); line.textContent=`${label}: ${value}`; details.append(line);}); };
  const complete = (data) => { if (tokenInput) tokenInput.value=data.lookupToken || ""; if (choices) choices.replaceChildren(); if (extra) extra.hidden=true; preview(data.preview || {}); apply(data.preRegistration || {}); setStatus(copy.found); };
  const request = async (body) => { const response=await fetch("/api/pre-registration/lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); const data=await response.json(); if(!response.ok||!data.ok) throw new Error(data.error||copy.error); return data; };
  const start = async () => { const identityDocument=normalizeIdentity(); if (!active || identityDocument.length<5) { documentInput?.reportValidity(); return; } const local=/^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname); const turnstileToken=window.turnstile&&turnstileNode?window.turnstile.getResponse(turnstileNode):""; if(!turnstileToken&&!local){setStatus(copy.captcha,true);return;} search.disabled=true; setStatus(copy.searching); try { const data=await request({action:"start",identityDocument,birthDate:birthDate?.value||"",turnstileToken}); if(data.route==="a"){ if(choices) { choices.replaceChildren(); const note=document.createElement("p"); note.textContent=copy.selectSurname; choices.append(note); data.surnameChoices.forEach((surname)=>{const button=document.createElement("button");button.type="button";button.className="pre-registration-choice";button.textContent=surname;button.addEventListener("click",async()=>{ try{complete(await request({action:"confirm_a",identityDocument,lookupToken:data.lookupToken,surname}));}catch(error){setStatus(error.message,true);}});choices.append(button);}); } } else if(data.route==="b_required"){ root.dataset.preRegistrationLookupToken=data.lookupToken || ""; if(extra) extra.hidden=false; [[extraGuild,data.guildOptions],[extraDiscipline,data.disciplineOptions]].forEach(([control,options])=>{if(!control||!Array.isArray(options))return;control.replaceChildren(new Option(english?"Select":"Seleccionar", ""));options.forEach((value)=>control.add(new Option(value,value)));}); setStatus(copy.extra); } else if(data.route==="birth_date_required") setStatus(copy.birthDate,true); else if(data.route==="existing_request") setStatus(copy.existing); else setStatus(copy.none); } catch(error){setStatus(error.message||copy.error,true);} finally {search.disabled=false;} };
  const confirmB=async()=>{try{const data=await request({action:"confirm_b",identityDocument:normalizeIdentity(),lookupToken:root.dataset.preRegistrationLookupToken||"",lastName:extraSurname?.value||"",guild:extraGuild?.value||"",discipline:extraDiscipline?.value||""}); if(data.match) complete(data); else setStatus(copy.invalid);}catch(error){setStatus(error.message||copy.error,true);}};
  documentInput?.addEventListener("input",()=>{reset();setStatus("");}); birthDate?.addEventListener("change",()=>{reset();setStatus("");}); search?.addEventListener("click",start); extraConfirm?.addEventListener("click",confirmB);
  // Cédula, tipo de documento y fecha de nacimiento son datos del registro (el servidor los exige);
  // solo la búsqueda del pre-registro depende de que haya campaña activa.
  const identityNames = new Set(["identityType", "identityDocument", "birthDate"]);
  const lookupControls = [search, status, turnstileNode, root.querySelector(".pre-registration-lookup__heading")].filter(Boolean);
  const lookupResults = [choices, extra, details].filter(Boolean);
  function applyState() {
    root.hidden = !active;
    lookupControls.forEach((node) => { node.hidden = !campaignAvailable; });
    if (!campaignAvailable) lookupResults.forEach((node) => { node.hidden = true; });
    root.querySelectorAll("input,select,button,textarea").forEach((control) => {
      const identity = identityNames.has(control.name);
      const enabled = identity ? active : active && campaignAvailable;
      control.disabled = !enabled;
      if (control.dataset.required === "true") control.required = enabled;
    });
  }
  fetch("/api/pre-registration/lookup", { headers:{ Accept:"application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => { if (data && data.active === false) { campaignAvailable = false; applyState(); } })
    .catch(() => {});
  return {
    setActive(next) {
      active = Boolean(next);
      applyState();
    },
    clear() { reset(); },
    ensure: async () => true
  };
}
function prepareMembershipWizardForSubmit(form) {
  if (!form || !form.matches("[data-membership-wizard]")) return;
  const profile = form.querySelector("[name='requestProfile']:checked")?.value || "professional";
  const enable = (root, active) => {
    if (!root) return;
    root.querySelectorAll("input, select, textarea").forEach((control) => {
      if (control.type === "hidden") return;
      control.disabled = !active;
    });
  };
  form.querySelectorAll("[data-wizard-step]").forEach((step) => enable(step, true));
  form.querySelectorAll("[data-profile-panel]").forEach((panel) => enable(panel, panel.dataset.profilePanel === profile));
  enable(form.querySelector("[data-institution-name]"), profile === "professional" && form.querySelector("[data-belongs-institution]")?.value === "yes");
  enable(form.querySelector("[data-team-details]"), profile === "professional" && ["yes", "register"].includes(form.querySelector("[name='participatesInTeam']")?.value));
  enable(form.querySelector("[data-general-message]"), profile !== "information");
  const membershipType = form.querySelector("[data-membership-type-hidden]");
  if (membershipType) {
    if (profile === "organization") membershipType.value = "organization";
    else if (profile === "team") membershipType.value = "team-delegate";
    else if (profile === "information") membershipType.value = "info-request";
    else membershipType.value = form.querySelector("[data-belongs-institution]")?.value === "yes" ? "institutional-member" : "independent";
  }
}

function setupMembershipWizard(form) {
  const steps = Array.from(form.querySelectorAll("[data-wizard-step]"));
  const navItems = Array.from(form.querySelectorAll("[data-wizard-nav]"));
  const progress = form.querySelector("[data-wizard-progress]");
  const prev = form.querySelector("[data-wizard-prev]");
  const next = form.querySelector("[data-wizard-next]");
  const finalPrev = form.querySelector("[data-wizard-final-prev]");
  const profileRadios = Array.from(form.querySelectorAll("[name='requestProfile']"));
  const membershipType = form.querySelector("[data-membership-type-hidden]");
  const panels = Array.from(form.querySelectorAll("[data-profile-panel]"));
  const professionList = form.querySelector("[data-profession-list]");
  const disciplineList = form.querySelector("[data-discipline-list]");
  const membershipNumberFields = form.querySelector("[data-membership-number-fields]");
  const professionOtherFields = Array.from(form.querySelectorAll("[data-profession-other]"));
  const belongsInstitution = form.querySelector("[data-belongs-institution]");
  const institutionName = form.querySelector("[data-institution-name]");
  const teamQuestion = form.querySelector("[name='participatesInTeam']");
  const teamDetails = form.querySelector("[data-team-details]");
  const generalMessage = form.querySelector("[data-general-message]");
  const birthDate = form.querySelector("[name='birthDate']");
  const preLookup = setupPreRegistrationLookup(form);
  let currentStep = 0;
  let professionCount = 0;
  let disciplineCount = 0;
  const completedSteps = new Set();
  const membershipNumbersByProfession = new Map();

  if (birthDate && !birthDate.max) birthDate.max = new Date().toISOString().slice(0, 10);

  const professionOptions = [
    ["doctor", "Médico"],
    ["dentist", "Odontólogo"],
    ["bioanalyst", "Bioanalista"],
    ["pharmacist", "Farmacéutico"],
    ["nurse", "Enfermero / Licenciado en Enfermería"],
    ["psychologist", "Psicólogo"],
    ["nutritionist", "Nutricionista y Dietista"],
    ["physiotherapist", "Fisioterapeuta"],
    ["architect", "Arquitecto"],
    ["engineer", "Ingeniero"],
    ["data_ai", "Científico de Datos / Especialista en IA"],
    ["lawyer", "Abogado"],
    ["accountant", "Contador Público"],
    ["administrator", "Administrador"],
    ["economist", "Economista"],
    ["finance_risk", "Financista / Analista de Riesgo"],
    ["hr_ir", "Especialista en Recursos Humanos / Relaciones Industriales"],
    ["teacher", "Docente / Profesor"],
    ["psychopedagogue", "Psicopedagogo"],
    ["historian", "Historiador"],
    ["philosopher", "Filósofo"],
    ["geographer_geologist", "Geógrafo / Geólogo"],
    ["journalist", "Periodista / Comunicador Social"],
    ["graphic_ux_ui", "Diseñador Gráfico / Diseñador UX/UI"],
    ["advertising_marketing", "Publicista / Especialista en Marketing Digital"],
    ["translator_interpreter", "Traductor e Intérprete"],
    ["artist_musician_actor", "Artista Plástico / Músico / Actor"],
    ["sociologist", "Sociólogo"],
    ["anthropologist", "Antropólogo"],
    ["social_worker", "Trabajador Social"],
    ["political_scientist", "Politólogo"],
    ["internationalist", "Internacionalista"],
    ["veterinarian", "Veterinario"],
    ["estadista", "Estadista"],
    ["actuary", "Actuario"],
    ["police_sciences", "Ciencias Policiales"],
    ["other", "Otra profesión"],
  ];

  const disciplineOptions = [
    ["softball", "Softbol"],
    ["kickingball", "Kickingball"],
    ["volleyball", "Voleibol"],
    ["volleyball_court", "Voleibol de cancha"],
    ["volleyball_beach", "Voleibol de playa"],
    ["football", "Fútbol"],
    ["basketball", "Baloncesto"],
    ["swimming", "Natación"],
    ["bolas_criollas", "Bolas criollas"],
    ["domino", "Dominó"],
    ["running", "Caminata / carrera"],
    ["undecided", "Por definir"],
  ];

  const typeLabels = {
    professional: "Profesional individual",
    organization: "Institución / gremio / colegio",
    team: "Equipo o delegado",
    information: "Quiero información antes de afiliarme",
  };

  const profileToMembership = {
    professional: () => belongsInstitution?.value === "yes" ? "institutional-member" : "independent",
    organization: () => "organization",
    team: () => "team-delegate",
    information: () => "info-request",
  };

  const getProfile = () => form.querySelector("[name='requestProfile']:checked")?.value || "professional";
  const isProfessional = () => getProfile() === "professional";
  const optionMarkup = (options) => `<option value="">Seleccionar</option>${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}`;

  const selectedSelects = (selector) => Array.from(form.querySelectorAll(selector)).filter((select) => select.value);
  const selectedProfessions = () => selectedSelects("[data-profession-select]").map((select) => ({
    value: select.value,
    label: select.selectedOptions[0]?.textContent.trim() || select.value,
  }));
  const selectedDisciplines = () => selectedSelects("[data-discipline-select]").map((select) => ({
    value: select.value,
    label: select.selectedOptions[0]?.textContent.trim() || select.value,
  }));

  const setControls = (root, active) => {
    root.querySelectorAll("input, select, textarea").forEach((control) => {
      if (control.type === "hidden") return;
      control.disabled = !active;
      control.required = active && control.dataset.required === "true";
    });
  };

  const updateOtherProfession = () => {
    const showOther = isProfessional() && selectedProfessions().some((profession) => profession.value === "other");
    professionOtherFields.forEach((field) => {
      field.classList.toggle("is-hidden", !showOther);
      field.querySelectorAll("input, select, textarea").forEach((control) => {
        control.disabled = !showOther;
        control.required = showOther && control.dataset.required === "true";
      });
    });
  };

  const updateTeamDetails = () => {
    if (!teamQuestion || !teamDetails) return;
    const show = isProfessional() && ["yes", "register"].includes(teamQuestion.value);
    teamDetails.classList.toggle("is-hidden", !show);
    teamDetails.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = !show;
      control.required = show && control.dataset.required === "true";
    });
  };

  const updateInstitutionField = () => {
    if (!belongsInstitution || !institutionName) return;
    const show = isProfessional() && belongsInstitution.value === "yes";
    institutionName.classList.toggle("is-hidden", !show);
    institutionName.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = !show;
      control.required = show && control.dataset.required === "true";
    });
  };

  const updateMembershipType = () => {
    if (membershipType) membershipType.value = profileToMembership[getProfile()]?.() || "independent";
  };

  const rememberMembershipNumbers = () => {
    form.querySelectorAll("[data-membership-number-input]").forEach((input) => {
      const key = input.dataset.membershipNumberKey;
      if (key) membershipNumbersByProfession.set(key, input.value.trim());
    });
  };

  const renderMembershipNumberFields = () => {
    if (!membershipNumberFields) return;
    rememberMembershipNumbers();
    membershipNumberFields.innerHTML = "";
    if (!isProfessional()) {
      updateMembershipNumberSummary(form);
      return;
    }
    selectedProfessions().forEach((profession, index) => {
      const label = document.createElement("label");
      label.textContent = `${index === 0 ? "Profesión principal" : `Profesión adicional ${index}`}: ${profession.label}`;
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 80;
      input.dataset.membershipNumberInput = "true";
      input.dataset.membershipNumberKey = profession.value;
      input.dataset.professionLabel = profession.label;
      input.value = membershipNumbersByProfession.get(profession.value) || "";
      input.placeholder = `Número de colegiado / registro para ${profession.label}`;
      input.autocomplete = "off";
      input.addEventListener("input", () => {
        membershipNumbersByProfession.set(profession.value, input.value.trim());
        updateMembershipNumberSummary(form);
      });
      label.appendChild(input);
      membershipNumberFields.appendChild(label);
    });
    updateMembershipNumberSummary(form);
  };

  const addRepeatRow = (kind) => {
    const isProfessionRow = kind === "profession";
    const list = isProfessionRow ? professionList : disciplineList;
    if (!list) return;
    const count = isProfessionRow ? ++professionCount : ++disciplineCount;
    const row = document.createElement("div");
    row.className = "repeat-row";
    row.innerHTML = `
      <label>${isProfessionRow ? "Profesión" : "Disciplina"} adicional ${count}
        <select name="${isProfessionRow ? "otherProfessions" : "otherDisciplines"}" data-${kind}-select>${optionMarkup(isProfessionRow ? professionOptions : disciplineOptions)}</select>
      </label>
      <button class="remove-line" type="button" aria-label="Eliminar">×</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      row.remove();
      updateWizard();
    });
    row.querySelector("select").addEventListener("change", updateWizard);
    list.appendChild(row);
    updateWizard();
  };

  const visibleTotal = () => isProfessional() ? 4 : 3;
  const displayStep = () => !isProfessional() && currentStep === 3 ? 3 : currentStep + 1;

  const updateSummary = () => {
    const firstName = form.querySelector("[name='firstName']")?.value.trim() || "Nombre pendiente";
    const lastName = form.querySelector("[name='lastName']")?.value.trim() || "";
    const email = form.querySelector("[name='email']")?.value.trim() || "correo pendiente";
    const phone = form.querySelector("[name='phone']")?.value.trim() || "teléfono pendiente";
    const typeNode = form.querySelector("[data-summary-type]");
    const contactNode = form.querySelector("[data-summary-contact]");
    const profileNode = form.querySelector("[data-summary-profile]");
    const privateNode = form.querySelector("[data-summary-private]");
    const profile = getProfile();
    if (typeNode) typeNode.textContent = typeLabels[profile] || "";
    if (contactNode) contactNode.textContent = `${firstName} ${lastName}`.trim() + ` · ${email} · ${phone}`;
    if (!profileNode || !privateNode) return;
    if (profile === "professional") {
      const professions = selectedProfessions().map((item) => item.label).join(", ") || "Profesión pendiente";
      const disciplines = selectedDisciplines().map((item) => item.label).join(", ") || "Disciplina pendiente";
      profileNode.textContent = `Profesional individual · ${professions} · ${disciplines}`;
      privateNode.textContent = "Incluye fecha de nacimiento, documento y número de colegiado por profesión.";
    } else if (profile === "organization") {
      profileNode.textContent = "Datos de organización, RIF, representante, miembros estimados y área de interés.";
      privateNode.textContent = "No se solicitan documentos personales en este flujo.";
    } else if (profile === "team") {
      profileNode.textContent = "Equipo, disciplina, categoría, institución asociada y rol del contacto.";
      privateNode.textContent = "No se solicitan datos sensibles del delegado en este flujo.";
    } else {
      profileNode.textContent = "Tema de interés y mensaje breve.";
      privateNode.textContent = "No se solicitan datos sensibles.";
    }
  };

  const updateWizard = () => {
    const profile = getProfile();
    if (profile !== "professional") preLookup.clear();
    panels.forEach((panel) => {
      const active = panel.dataset.profilePanel === profile;
      panel.classList.toggle("is-hidden", !active);
      setControls(panel, active);
    });
    updateMembershipType();
    updateInstitutionField();
    updateOtherProfession();
    updateTeamDetails();
    renderMembershipNumberFields();
    if (generalMessage) {
      const showGeneralMessage = profile !== "information";
      generalMessage.classList.toggle("is-hidden", !showGeneralMessage);
      setControls(generalMessage, showGeneralMessage && currentStep === 3);
    }
    navItems[2]?.classList.toggle("is-hidden", !isProfessional());
    steps.forEach((step, index) => {
      const active = index === currentStep;
      step.classList.toggle("is-active", active);
      setControls(step, active);
    });
    panels.forEach((panel) => setControls(panel, panel.dataset.profilePanel === profile && currentStep === 1));
    updateInstitutionField();
    updateOtherProfession();
    updateTeamDetails();
    if (membershipNumberFields) setControls(membershipNumberFields, currentStep === 2 && isProfessional());
    if (generalMessage) setControls(generalMessage, profile !== "information" && currentStep === 3);
    preLookup.setActive(isProfessional() && currentStep === 0);
    navItems.forEach((item, index) => item.classList.toggle("is-active", index === currentStep));
    const total = visibleTotal();
    const number = displayStep();
    form.querySelectorAll("[data-step-count]").forEach((node) => {
      node.textContent = `Paso ${number} de ${total}`;
    });
    if (progress) progress.style.width = `${(number / total) * 100}%`;
    if (prev) prev.style.visibility = currentStep === 0 || currentStep === 3 ? "hidden" : "visible";
    if (finalPrev) finalPrev.hidden = currentStep !== 3;
    if (next) {
      next.hidden = currentStep === 3;
      next.textContent = "Siguiente";
    }
    updateSummary();
  };

  const validateCurrentStep = () => {
    const activeStep = steps[currentStep];
    const controls = Array.from(activeStep.querySelectorAll("input, select, textarea")).filter((control) => !control.disabled && control.required);
    const invalid = controls.find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  };

  const nextStepAfter = (step) => (!isProfessional() && step === 1 ? 3 : Math.min(3, step + 1));

  form.lgdValidateBeforeSubmit = () => {
    const finalStep = 3;
    if (currentStep !== finalStep || ![0, 1, 2].filter((step) => isProfessional() || step !== 2).every((step) => completedSteps.has(step))) {
      const firstMissing = [0, 1, 2].find((step) => (isProfessional() || step !== 2) && !completedSteps.has(step));
      goToStep(firstMissing ?? finalStep);
      return false;
    }
    return validateCurrentStep();
  };

  const goToStep = (step) => {
    currentStep = Math.max(0, Math.min(3, step));
    if (!isProfessional() && currentStep === 2) currentStep = 3;
    updateWizard();
    form.closest(".contact-form-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  profileRadios.forEach((radio) => radio.addEventListener("change", () => {
    currentStep = 0;
    completedSteps.clear();
    updateWizard();
  }));
  form.querySelector("[data-add-profession]")?.addEventListener("click", () => addRepeatRow("profession"));
  form.querySelector("[data-add-discipline]")?.addEventListener("click", () => addRepeatRow("discipline"));
  belongsInstitution?.addEventListener("change", updateWizard);
  teamQuestion?.addEventListener("change", updateWizard);
  form.addEventListener("input", updateSummary);
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-profession-select], [data-discipline-select]")) updateWizard();
  });
  prev?.addEventListener("click", () => {
    if (!isProfessional() && currentStep === 3) goToStep(1);
    else goToStep(currentStep - 1);
  });
  finalPrev?.addEventListener("click", () => {
    if (!isProfessional() && currentStep === 3) goToStep(1);
    else goToStep(currentStep - 1);
  });
  next?.addEventListener("click", async () => {
    if (!validateCurrentStep()) return;
    if (currentStep === 0 && isProfessional() && !(await preLookup.ensure())) return;
    completedSteps.add(currentStep);
    if (currentStep === 3) {
      form.requestSubmit();
      return;
    }
    goToStep(nextStepAfter(currentStep));
  });
  navItems.forEach((item) => item.addEventListener("click", async () => {
    const target = Number(item.dataset.wizardNav);
    if (target <= currentStep) { goToStep(target); return; }
    if (target !== nextStepAfter(currentStep) || !validateCurrentStep()) return;
    if (currentStep === 0 && isProfessional() && !(await preLookup.ensure())) return;
    completedSteps.add(currentStep);
    goToStep(target);
  }));

  updateWizard();
}


