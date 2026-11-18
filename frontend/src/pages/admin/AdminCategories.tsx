import { useState, type FormEvent } from 'react';
import { Plus, Shapes, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import type { Category } from '../../lib/types';
import { ConfirmDialog, ErrorBanner, Field, PageHeader, PageLoader, Pill, Spinner, useAction } from '../../components/ui';

export default function AdminCategories() {
  const { data, error, loading, reload } = useFetch(() => api.get<{ categories: Category[] }>('/categories?all=1'), []);
  const { busy, run } = useAction();
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<unknown>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [del, setDel] = useState<Category | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await run('create', async () => { try { return await api.post('/categories', { name }); } catch (err) { setFormError(err); throw err; } }, 'Catégorie créée.');
      setName(''); reload(true);
    } catch { /* affiché */ }
  };

  const toggle = async (c: Category) => {
    const r = await run('t' + c.id, () => api.put(`/categories/${c.id}`, { active: !c.active }), c.active ? 'Catégorie désactivée.' : 'Catégorie réactivée.');
    if (r !== undefined) reload(true);
  };

  const rename = async () => {
    if (!editing) return;
    const r = await run('r' + editing.id, () => api.put(`/categories/${editing.id}`, { name: editing.name }), 'Catégorie renommée.');
    if (r !== undefined) { setEditing(null); reload(true); }
  };

  const remove = async () => {
    if (!del) return;
    const r = await run('d' + del.id, () => api.del(`/categories/${del.id}`), 'Catégorie supprimée.');
    if (r !== undefined) { setDel(null); reload(true); }
  };

  return (
    <>
      <PageHeader title="Catégories" subtitle="Les catégories actives sont proposées aux étudiants lors de la création d'une offre." />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <ErrorBanner error={error} />
          {loading ? <PageLoader /> : (
            <div className="card divide-y divide-slate-100">
              {data?.categories.length === 0 && <p className="p-6 text-sm text-ink-500">Aucune catégorie. Créez la première.</p>}
              {data?.categories.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  {editing?.id === c.id ? (
                    <div className="flex flex-1 gap-2">
                      <input className="input" value={editing.name} onChange={(e) => setEditing(editing ? { ...editing, name: e.target.value } : null)} autoFocus />
                      <button className="btn-primary btn-sm" disabled={!!busy} onClick={rename}>Enregistrer</button>
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(null)}>Annuler</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Shapes className="h-4 w-4" /></span>
                        <span className="font-semibold">{c.name}</span>
                        {c.active ? <Pill tone="emerald">Active</Pill> : <Pill tone="rose">Inactive</Pill>}
                      </div>
                      <div className="flex gap-1">
                        <button className="btn-ghost btn-sm" onClick={() => setEditing({ id: c.id, name: c.name })}>Renommer</button>
                        <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => toggle(c)}>{c.active ? 'Désactiver' : 'Réactiver'}</button>
                        <button className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50" disabled={!!busy} onClick={() => setDel(c)} aria-label={`Supprimer ${c.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <form onSubmit={create} className="card h-fit space-y-3 p-5">
          <h2 className="text-base font-bold">Nouvelle catégorie</h2>
          <ErrorBanner error={formError} />
          <Field label="Nom"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Langues" maxLength={60} required /></Field>
          <button className="btn-primary w-full" disabled={!name.trim() || !!busy}>{busy === 'create' ? <Spinner /> : <Plus className="h-4 w-4" />}Créer</button>
          <p className="text-xs text-ink-500">Une catégorie utilisée par des offres ne peut pas être supprimée : désactivez-la pour la retirer du formulaire de création.</p>
        </form>
      </div>
      <ConfirmDialog open={!!del} danger title="Supprimer la catégorie" text={`La catégorie « ${del?.name} » sera supprimée définitivement. Si des offres l'utilisent, la suppression sera refusée.`} confirmLabel="Supprimer" busy={!!busy} onConfirm={remove} onClose={() => setDel(null)} />
    </>
  );
}
