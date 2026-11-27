"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Headphones, BookOpen, Users, ChartNoAxesCombined, GraduationCap } from "lucide-react";

function EdunexaMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="edunexa-mark-gradient" x1="8" y1="5" x2="55" y2="59" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16B9E8" />
          <stop offset=".55" stopColor="#087FF5" />
          <stop offset="1" stopColor="#7139D8" />
        </linearGradient>
      </defs>
      <path d="M42 7H24C13.5 7 6 14.4 6 25v14c0 10.8 7.4 18 18 18h18l8-9H25c-5.1 0-8-2.8-8-8V25c0-5 2.9-8 8-8h17l8-10H42Z" fill="url(#edunexa-mark-gradient)"/>
      <path d="M22 24h29l-7.5 9H22v-9Zm0 15h23l-7.5 9H22v-9Z" fill="url(#edunexa-mark-gradient)"/>
      <path d="m46 9 8-4v10l-8 4V9Z" fill="#16B9E8"/>
      <circle cx="57" cy="24" r="3" fill="#16B9E8"/>
      <circle cx="52" cy="31" r="2" fill="#7139D8"/>
    </svg>
  );
}

function NetworkGlobe() {
  return (
    <svg className="network-globe" viewBox="0 0 520 430" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="globe-fill" cx="0" cy="0" r="1" gradientTransform="translate(260 210) rotate(90) scale(190)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#087FF5" stopOpacity=".34"/><stop offset="1" stopColor="#087FF5" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="globe-line" x1="60" y1="60" x2="460" y2="360" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16B9E8"/><stop offset="1" stopColor="#7139D8"/>
        </linearGradient>
      </defs>
      <circle cx="260" cy="210" r="190" fill="url(#globe-fill)"/>
      <circle cx="260" cy="210" r="172" stroke="url(#globe-line)" strokeOpacity=".8" strokeWidth="1.4"/>
      <ellipse cx="260" cy="210" rx="82" ry="172" stroke="#16B9E8" strokeOpacity=".48"/>
      <ellipse cx="260" cy="210" rx="142" ry="172" stroke="#16B9E8" strokeOpacity=".32"/>
      <path d="M91 210h338M116 132h288M116 288h288M260 38v344" stroke="#16B9E8" strokeOpacity=".34"/>
      <path d="M138 93 220 155 324 102 400 181 347 278 236 334 130 258 91 210 138 93Z" stroke="url(#globe-line)" strokeWidth="1.6" strokeOpacity=".85"/>
      <path d="m138 93 122 117 64-108M220 155l-84 103 124 76 87-56-87-68-64-55Zm190 88-81-81-87 38-64-45" stroke="#16B9E8" strokeOpacity=".55"/>
      {[[138,93],[260,210],[324,102],[400,181],[347,278],[236,334],[130,258],[220,155],[91,210],[429,210],[260,38],[260,382]].map(([cx,cy],i)=><g key={i}><circle cx={cx} cy={cy} r="7" fill="#16B9E8" fillOpacity=".18"/><circle cx={cx} cy={cy} r="3.2" fill="#55DDFB"/></g>)}
    </svg>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [languageOpen, setLanguageOpen] = useState(false);
  const isEnglish = language === "en";
  const notice = search.get("message");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "We could not sign you in. Check your details and try again." : "No pudimos iniciar sesión. Revisá tus datos e intentá nuevamente."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell edunexa-home">
      <section className="auth-visual edunexa-hero">
        <div className="hero-top">
          <div className="auth-brand edunexa-brand">
            <EdunexaMark size={68}/>
            <div className="brand-wordmark"><strong>EDUNEXA</strong><span>Tecnología que conecta la educación</span></div>
          </div>
          <div className="hero-label">{isEnglish ? "EDUCATION" : "EDUCACIÓN"} <i/> {isEnglish ? "INNOVATION" : "INNOVACIÓN"} <i/> {isEnglish ? "FUTURE" : "FUTURO"}</div>
        </div>

        <div className="hero-main">
          <div className="hero-message">
            <div className="hero-overline"><span/> {isEnglish ? "INTEGRATED EDUCATION PLATFORM" : "PLATAFORMA INTEGRAL EDUCATIVA"}</div>
            <h1>{isEnglish ? <>Learn.<br/>Manage.<br/><em>Connect.</em></> : <>Aprender.<br/>Gestionar.<br/><em>Conectar.</em></>}</h1>
            <p>{isEnglish ? "An integrated platform for educational institutions, teachers, students and families." : "Una plataforma integral para instituciones educativas, docentes, alumnos y familias."}</p>
            <div className="hero-features">
              <div><span className="feature-icon"><GraduationCap size={23}/></span><b>{isEnglish ? <>Digital<br/>education</> : <>Educación<br/>digital</>}</b></div>
              <div><span className="feature-icon"><Users size={23}/></span><b>{isEnglish ? <>Integrated<br/>management</> : <>Gestión<br/>integral</>}</b></div>
              <div><span className="feature-icon"><ChartNoAxesCombined size={23}/></span><b>{isEnglish ? <>Learning<br/>without limits</> : <>Aprendizaje<br/>sin límites</>}</b></div>
              <div><span className="feature-icon"><BookOpen size={23}/></span><b>{isEnglish ? <>Educational<br/>community</> : <>Comunidad<br/>educativa</>}</b></div>
            </div>
          </div>
          <div className="hero-graphic"><NetworkGlobe/><div className="graphic-monogram"><EdunexaMark size={82}/></div><span className="graphic-caption">CONECTAMOS PERSONAS · DATOS · OPORTUNIDADES</span></div>
        </div>

        <div className="hero-bottom"><span>EDUNEXA <b>•</b> {isEnglish ? "LEARN. MANAGE. CONNECT." : "APRENDER. GESTIONAR. CONECTAR."}</span><span>01 / 04</span></div>
      </section>

      <section className="auth-panel edunexa-login-panel">
        <div className="login-topline"><span>{isEnglish ? "EDUCATION" : "EDUCACIÓN"} <b>•</b> {isEnglish ? "INNOVATION" : "INNOVACIÓN"} <b>•</b> {isEnglish ? "FUTURE" : "FUTURO"}</span><div className="language-control"><button type="button" className="language-pill" aria-haspopup="menu" aria-expanded={languageOpen} onClick={() => setLanguageOpen(!languageOpen)}>{language.toUpperCase()} <span>⌄</span></button>{languageOpen && <div className="language-menu" role="menu"><button type="button" role="menuitem" onClick={() => {setLanguage("es");setLanguageOpen(false);}}>Español {language === "es" ? "✓" : ""}</button><button type="button" role="menuitem" onClick={() => {setLanguage("en");setLanguageOpen(false);}}>English {language === "en" ? "✓" : ""}</button></div>}</div></div>
        <div className="login-card edunexa-login-card">
          <div className="login-card-heading">
            <div className="login-mark"><EdunexaMark size={58}/></div>
            <div><span className="login-eyebrow">{isEnglish ? "YOUR EDUCATIONAL SPACE" : "TU ESPACIO EDUCATIVO"}</span><h2>{isEnglish ? "Welcome to" : "Bienvenido a"} <span>EDUNEXA</span></h2><p className="login-subtitle">{isEnglish ? "Sign in to continue to your space" : "Ingresá a tu espacio para continuar"}</p></div>
          </div>
          {notice && <div className="auth-success" role="status">{notice}</div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="email">{isEnglish ? "Email address" : "Correo electrónico"}</label>
            <div className="field-wrap"><Mail size={19}/><input id="email" type="email" autoComplete="username" placeholder={isEnglish ? "name@school.edu" : "nombre@institucion.edu"} value={email} onChange={e=>setEmail(e.target.value)} required/></div>
            <div className="password-label"><label htmlFor="password">{isEnglish ? "Password" : "Contraseña"}</label><Link href="/forgot-password">{isEnglish ? "Forgot your password?" : "¿Olvidaste tu contraseña?"}</Link></div>
            <div className="field-wrap"><LockKeyhole size={19}/><input id="password" type={showPassword?"text":"password"} autoComplete="current-password" placeholder={isEnglish ? "Enter your password" : "Ingresá tu contraseña"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/><button type="button" className="reveal-button" aria-label={showPassword?"Ocultar contraseña":"Mostrar contraseña"} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>
            <button className="login-submit" type="submit" disabled={loading}>{loading ? (isEnglish ? "Signing in..." : "Ingresando...") : (isEnglish ? "Sign in" : "Ingresar")}<ArrowRight size={19}/></button>
          </form>
          <p className="account-policy">{isEnglish ? "Accounts are created and enabled by your institution’s administrator. If you need access, please contact your institution." : "Las cuentas son creadas y habilitadas por el administrador de tu institución. Si necesitás acceso, comunicate con tu institución."}</p>
          <div className="login-divider"><span>{isEnglish ? "SECURE ACCESS" : "ACCESO SEGURO"}</span></div>
          <div className="secure-caption"><ShieldCheck size={19}/><span>{isEnglish ? "Your information is protected. Access depends on the permissions assigned by your institution." : "Tu información está protegida. El acceso depende de los permisos asignados por tu institución."}</span></div>
        </div>
        <footer className="auth-footer edunexa-footer"><span><b>EDUNEXA</b> · {isEnglish ? "Integrated Education Platform" : "Plataforma Integral Educativa"}</span><span><Headphones size={14}/> {isEnglish ? "Support" : "Soporte"} <i/> {isEnglish ? "Help" : "Ayuda"} <i/> {isEnglish ? "Contact" : "Contacto"}</span><span>© 2026 EDUNEXA. {isEnglish ? "All rights reserved." : "Todos los derechos reservados."}</span></footer>
      </section>
    </main>
  );
}
