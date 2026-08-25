'use client';

export default function DeleteButton({ id }: { id: string }) {
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  return (
    <button
      onClick={handleDelete}
      className="text-xs text-[#8b2e2e] hover:underline"
    >
      Delete
    </button>
  );
}
