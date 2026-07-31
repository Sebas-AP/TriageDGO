import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { config } from "../../config";
import { services } from "../../services";
import type { LocationValue } from "../../types";
import { LocationPicker } from "../maps/LocationPicker";

const steps = ["Tus datos", "Ubicación", "Descripción", "Fotografía", "Revisión"];
const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const schema = z.object({
  citizenName: z.string().trim().min(2, "Escribe tu nombre."),
  phone: z.string().regex(/^\d{10}$/, "Escribe un teléfono de 10 dígitos."),
  consent: z.literal(true, { errorMap: () => ({ message: "Necesitamos tu autorización para contactarte." }) }),
  location: z
    .object({ address: z.string().min(1), lat: z.number(), lng: z.number(), placeId: z.string().optional() })
    .optional()
    .refine(Boolean, "Selecciona la ubicación del reporte."),
  description: z.string().trim().min(20, "Describe el problema con al menos 20 caracteres.").max(800),
  clarificationAnswer: z.string().max(300).optional(),
  photo: z.instanceof(File).optional(),
});
type FormValues = z.infer<typeof schema>;

export default function ReportWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const stepRef = useRef(step);
  const revisionRef = useRef(0);
  const [question, setQuestion] = useState<string | null>(null);
  const [checkingQuestion, setCheckingQuestion] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { citizenName: "", phone: "", description: "", clarificationAnswer: "" },
  });
  const values = watch();
  const location = values.location as LocationValue | undefined;

  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  const fieldsByStep = useMemo<Array<Array<keyof FormValues>>>(
    () => [["citizenName", "phone", "consent"], ["location"], ["description"], [], []],
    [],
  );
  async function next() {
    const fields = fieldsByStep[step];
    if (fields.length > 0 && !(await trigger(fields))) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }
  async function checkClarification() {
    if (!(await trigger("description"))) return;
    const revision = ++revisionRef.current;
    setQuestion(null);
    setCheckingQuestion(true);
    try {
      const response = await services.reports.requestClarification(values.description, revision);
      if (stepRef.current === 2 && response.revision === revisionRef.current) setQuestion(response.question);
    } finally {
      if (revision === revisionRef.current) setCheckingQuestion(false);
    }
  }
  function selectPhoto(file?: File) {
    setSubmitError("");
    if (!file) {
      setValue("photo", undefined);
      setPhotoPreview("");
    } else if (!acceptedTypes.includes(file.type)) {
      setSubmitError("La fotografía debe ser JPEG, PNG o WebP.");
    } else if (file.size > config.maxPhotoBytes) {
      setSubmitError(`La fotografía no puede superar ${Math.round(config.maxPhotoBytes / 1024 / 1024)} MB.`);
    } else {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setValue("photo", file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }
  async function submit(data: FormValues) {
    setSubmitError("");
    try {
      const result = await services.reports.submit({ ...data, location: data.location as LocationValue });
      navigate(`/reporte/${result.folio}`, { state: { justSubmitted: true } });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "No pudimos enviar el reporte.");
    }
  }

  return (
    <main className="citizen-shell">
      <header className="citizen-header">
        <Link to="/" className="brand">
          <span className="brand-mark">072</span><span>Triage Durango</span>
        </Link>
        <Link to="/admin/login" className="quiet-link">Acceso municipal</Link>
      </header>
      <section className="wizard-card">
        <div className="wizard-heading">
          <div><p className="eyebrow">Reporte ciudadano</p><h1>Cuéntanos qué está pasando</h1><p>Te tomará aproximadamente tres minutos.</p></div>
          <span className="step-count">{step + 1}/{steps.length}</span>
        </div>
        <ol className="stepper" aria-label="Progreso del reporte">
          {steps.map((label, index) => (
            <li key={label} className={index === step ? "active" : index < step ? "complete" : ""}>
              <span>{index < step ? "✓" : index + 1}</span><small>{label}</small>
            </li>
          ))}
        </ol>
        <form onSubmit={handleSubmit(submit)} noValidate>
          {step === 0 && <div className="form-step">
            <h2>¿Con quién nos comunicamos?</h2>
            <label htmlFor="citizenName">Nombre completo</label><input id="citizenName" {...register("citizenName")} autoComplete="name" />
            {errors.citizenName && <p className="field-error">{errors.citizenName.message}</p>}
            <label htmlFor="phone">Teléfono</label><input id="phone" {...register("phone")} inputMode="numeric" autoComplete="tel" placeholder="10 dígitos" />
            {errors.phone && <p className="field-error">{errors.phone.message}</p>}
            <label className="checkbox-row"><input type="checkbox" {...register("consent")} /><span>Autorizo recibir información sobre este reporte por WhatsApp.</span></label>
            {errors.consent && <p className="field-error">{errors.consent.message}</p>}
          </div>}
          {step === 1 && <div className="form-step">
            <h2>¿Dónde ocurre?</h2>
            <LocationPicker value={location} onChange={(nextLocation) => setValue("location", nextLocation, { shouldValidate: true })} error={errors.location?.message} />
          </div>}
          {step === 2 && <div className="form-step">
            <h2>Describe el problema</h2>
            <label htmlFor="description">Incluye referencias y cualquier riesgo visible</label>
            <textarea id="description" rows={7} maxLength={800} {...register("description", { onChange: () => { revisionRef.current += 1; setQuestion(null); } })} placeholder="Ej. Hay un cable caído frente a la primaria y bloquea la banqueta…" />
            <div className="field-meta">{errors.description ? <span className="field-error">{errors.description.message}</span> : <span>Evita compartir información sensible.</span>}<span>{values.description.length}/800</span></div>
            <button className="secondary-button question-button" type="button" onClick={() => void checkClarification()}>{checkingQuestion ? "Analizando…" : "Revisar si falta algún dato"}</button>
            {question && <div className="agent-question"><span className="agent-spark">✦</span><div><strong>Una pregunta para mejorar el reporte</strong><label htmlFor="clarification">{question}</label><textarea id="clarification" rows={3} {...register("clarificationAnswer")} /><small>Es opcional y nunca bloqueará tu avance.</small></div></div>}
          </div>}
          {step === 3 && <div className="form-step">
            <h2>Agrega una fotografía</h2><p className="field-hint">Es opcional. Una imagen clara ayuda a estimar mejor el riesgo.</p>
            <label className="upload-zone"><input type="file" accept={acceptedTypes.join(",")} onChange={(event) => selectPhoto(event.target.files?.[0])} />
              {photoPreview ? <img src={photoPreview} alt="Vista previa de la evidencia" /> : <><span className="upload-icon">＋</span><strong>Seleccionar fotografía</strong><small>JPEG, PNG o WebP · máximo {Math.round(config.maxPhotoBytes / 1024 / 1024)} MB</small></>}
            </label>
            {photoPreview && <button type="button" className="text-button" onClick={() => selectPhoto()}>Quitar fotografía</button>}
          </div>}
          {step === 4 && <div className="form-step review-step">
            <h2>Revisa tu reporte</h2>
            <dl className="review-list">
              <div><dt>Ciudadano</dt><dd>{values.citizenName}</dd></div>
              <div><dt>Ubicación</dt><dd>{location?.address}</dd></div>
              <div><dt>Descripción</dt><dd>{values.description}</dd></div>
              <div><dt>Evidencia</dt><dd>{values.photo ? values.photo.name : "Sin fotografía"}</dd></div>
            </dl><p className="notice">Al enviar, recibirás un folio para consultar el seguimiento.</p>
          </div>}
          {submitError && <div className="error-banner" role="alert">{submitError}</div>}
          <div className="wizard-actions">
            {step > 0 && <button type="button" className="secondary-button" onClick={() => setStep((current) => current - 1)} disabled={isSubmitting}>Atrás</button>}
            <button
              type="button"
              className="primary-button"
              disabled={isSubmitting}
              onClick={step < steps.length - 1 ? () => void next() : () => void handleSubmit(submit)()}
            >
              {step < steps.length - 1 ? "Siguiente" : isSubmitting ? "Enviando…" : "Enviar reporte"}
            </button>
          </div>
        </form>
      </section>
      <footer className="public-footer">Atención ciudadana 072 · Gobierno Municipal de Durango</footer>
    </main>
  );
}
