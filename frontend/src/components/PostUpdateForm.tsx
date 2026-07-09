// frontend/src/components/PostUpdateForm.tsx

interface PostUpdateFormProps {
  campaignId: string;
  onSuccess: () => void;
  addUpdateMutation: (id: string, content: string) => Promise<void>;
}

// Adjust based on your Soroban smart contract limits (typically 280 or 500 characters for compact strings)
const MAX_CHARACTER_LIMIT = 280;

export const PostUpdateForm: React.FC<PostUpdateFormProps> = ({
  campaignId,
  onSuccess,
  addUpdateMutation,
}) => {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overLimitTimer, setOverLimitTimer] = useState<number>(0);

  const remainingCharacters = MAX_CHARACTER_LIMIT - content.length;
  const isOverLimit = remainingCharacters < 0;

  // Start countdown when over limit
  useEffect(() => {
    if (isOverLimit && overLimitTimer === 0) {
      setOverLimitTimer(5); // 5‑second countdown
    }
    if (overLimitTimer > 0) {
      const id = setTimeout(() => setOverLimitTimer(overLimitTimer - 1), 1000);
      return () => clearTimeout(id);
    }
  }, [isOverLimit, overLimitTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isOverLimit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await addUpdateMutation(campaignId, content.trim());
      setContent("");
      onSuccess();
      // Replace with your UI toast component if available
      alert("Update posted successfully!");
    } catch (err: any) {
      console.error("Failed to submit update to Soroban:", err);
      setError(err?.message || "Transaction failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm my-4">
      <h3 className="text-lg font-semibold mb-2">Post a Campaign Update</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <textarea
            className="w-full p-2 border rounded-md bg-background resize-none focus:ring-2 focus:ring-primary"
            rows={4}
            placeholder="Tell your backers what's happening..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="flex justify-between items-center mt-1 text-sm">
            <span
              className={isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}
            >
              {remainingCharacters} characters remaining
            </span>
            {isOverLimit && overLimitTimer > 0 && (
              <span className="text-destructive font-medium ml-2">
                Please shorten within {overLimitTimer}s
              </span>
            )}
            {error && <span className="text-destructive font-medium">{error}</span>}
          </div>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50"
          disabled={isSubmitting || !content.trim() || isOverLimit}
        >
          {isSubmitting ? "Submitting to Soroban..." : "Post Update"}
        </button>
      </form>
    </div>
  );
};
