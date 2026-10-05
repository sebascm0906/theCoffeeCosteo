import { FormularioAcceso } from '@/components/portal/formulario-acceso';
export default function Contrasena() {
  return (
    <main className="max-w-md mx-auto p-8 space-y-6">
      <h1>Establecer contraseña</h1>
      <p>Completa el acceso de tu cuenta invitada.</p>
      <div className="panel">
        <FormularioAcceso nueva />
      </div>
    </main>
  );
}
