import { Link } from 'react-router-dom';

const NotFoundPage = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <p className="text-sm uppercase tracking-[0.3em] text-slate-500">404</p>
    <h2 className="text-2xl font-semibold text-white">Conteúdo não encontrado</h2>
    <p className="max-w-md text-sm text-slate-400">
      O recurso solicitado não existe ou você não possui permissão para visualizá-lo. Verifique a URL ou volte para o painel.
    </p>
    <Link
      to="/dashboard"
      className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400"
    >
      Ir para o dashboard
    </Link>
  </div>
);

export default NotFoundPage;
