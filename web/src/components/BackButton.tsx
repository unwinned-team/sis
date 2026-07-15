import { useNavigate } from 'react-router-dom';

export function BackButton() {
  const navigate = useNavigate();

  const handleClick = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/40 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md transition hover:bg-white/65 hover:text-slate-900"
    >
      <span aria-hidden="true" className="text-base leading-none">
        ←
      </span>
      Назад
    </button>
  );
}
