import type { PaperDocument } from '../types/paper'

export const samplePaper: PaperDocument = {
  id: 'sample:attention-is-all-you-need',
  isSample: true,
  metadata: {
    id: '1706.03762v5',
    title: 'Attention Is All You Need',
    authors: [
      'Ashish Vaswani',
      'Noam Shazeer',
      'Niki Parmar',
      'Jakob Uszkoreit',
      'Llion Jones',
      'Aidan N. Gomez',
      'Łukasz Kaiser',
      'Illia Polosukhin',
    ],
    abstract: 'A sequence model built entirely around attention can replace recurrence and convolution while training more efficiently in parallel.',
    published: '2017-06-12',
    categories: ['cs.CL', 'cs.LG'],
    sourceUrl: 'https://arxiv.org/abs/1706.03762',
    pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
  },
  outline: [
    { id: 'paper-abstract', title: 'Abstract', depth: 2 },
    { id: 'section-1-introduction', title: '1 Introduction', depth: 2 },
    { id: 'section-2-background', title: '2 Background', depth: 2 },
    { id: 'section-3-model-architecture', title: '3 Model Architecture', depth: 2 },
    { id: 'section-3-1-encoder-and-decoder-stacks', title: '3.1 Encoder and Decoder Stacks', depth: 3 },
    { id: 'section-3-2-attention', title: '3.2 Attention', depth: 3 },
    { id: 'section-4-why-self-attention', title: '4 Why Self-Attention', depth: 2 },
    { id: 'section-5-training', title: '5 Training', depth: 2 },
    { id: 'section-6-conclusion', title: '6 Conclusion', depth: 2 },
  ],
  acronyms: [
    { acronym: 'RNN', expansion: 'recurrent neural network' },
    { acronym: 'NMT', expansion: 'neural machine translation' },
  ],
  html: `
    <section class="paper-abstract" aria-labelledby="paper-abstract">
      <h2 id="paper-abstract">Abstract</h2>
      <p>The dominant sequence transduction models have traditionally used recurrent or convolutional layers. This paper introduces the Transformer, a network based entirely on attention mechanisms, and shows that it can improve translation quality while making training substantially more parallel.</p>
    </section>
    <section>
      <h2 id="section-1-introduction">1 Introduction</h2>
      <p>Sequence transduction problems are usually framed as an encoder–decoder system. The best-performing models connect those two sides through an attention mechanism, but still place recurrent computation around it.</p>
      <p>The paper proposes a simpler architecture: the Transformer relies on attention to model dependencies between every pair of positions. Removing recurrence makes the computation easier to parallelize and helps the model learn long-range relationships.</p>
    </section>
    <section>
      <h2 id="section-2-background">2 Background</h2>
      <p>A recurrent neural network (<abbr class="paper-acronym" data-expansion="recurrent neural network" title="recurrent neural network" aria-label="RNN: recurrent neural network; defined in this paper" tabindex="0">RNN</abbr>) processes a sequence step by step. That order makes it difficult to parallelize training and creates a longer path between distant tokens.</p>
      <p>Earlier work reduced sequential computation with convolutions. Self-attention takes the next step by relating every position directly to every other position.</p>
    </section>
    <section>
      <h2 id="section-3-model-architecture">3 Model Architecture</h2>
      <p>The Transformer follows the familiar encoder–decoder shape. Both halves are stacks of repeated layers with residual connections and normalization around each sub-layer.</p>
      <figure class="architecture-figure">
        <div class="figure-flow" role="img" aria-label="Simplified encoder to attention to decoder flow">
          <span>Input embedding</span><i></i><span>Encoder stack</span><i></i><span>Multi-head attention</span><i></i><span>Decoder stack</span>
        </div>
        <figcaption>A compact view of the Transformer’s information flow.</figcaption>
      </figure>
      <h3 id="section-3-1-encoder-and-decoder-stacks">3.1 Encoder and Decoder Stacks</h3>
      <p>Each encoder layer combines multi-head self-attention with a position-wise feed-forward network. The decoder adds masked attention so a prediction cannot inspect later output positions.</p>
      <h3 id="section-3-2-attention">3.2 Attention</h3>
      <p>An attention function maps a query and a set of key–value pairs to an output. Compatibility scores determine how much each value contributes.</p>
      <div class="paper-equation" role="math" aria-label="Attention of Q K V equals softmax of Q K transpose over square root d k, times V">
        Attention(Q, K, V) = softmax(QK<sup>T</sup> / √d<sub>k</sub>)V
      </div>
      <p>Multi-head attention repeats this operation in learned subspaces, letting the model attend to different kinds of relationships at the same time.</p>
    </section>
    <section>
      <h2 id="section-4-why-self-attention">4 Why Self-Attention</h2>
      <p>Self-attention reduces the number of sequential operations, keeps the path between positions short, and remains computationally attractive for the sequence lengths used in translation.</p>
    </section>
    <section>
      <h2 id="section-5-training">5 Training</h2>
      <p>The authors train on paired sentence datasets with Adam, scheduled learning rates, residual dropout, and label smoothing. The largest model improves quality while using less training compute than the strongest prior systems.</p>
      <table>
        <thead><tr><th>Model</th><th>Parallel steps</th><th>Path length</th></tr></thead>
        <tbody><tr><td>Recurrent</td><td>O(n)</td><td>O(n)</td></tr><tr><td>Self-attention</td><td>O(1)</td><td>O(1)</td></tr></tbody>
      </table>
    </section>
    <section>
      <h2 id="section-6-conclusion">6 Conclusion</h2>
      <p>The results show that attention alone is a practical foundation for sequence modeling. The architecture trains quickly, transfers to new tasks, and opens a direct route to modeling relationships across long sequences.</p>
    </section>
  `,
  plainText: `Abstract. A sequence model built entirely around attention can replace recurrence and convolution while training more efficiently in parallel. Introduction. Sequence transduction problems are usually framed as encoder-decoder systems. The Transformer relies on attention to model dependencies between every pair of positions. Background. A recurrent neural network (RNN) processes a sequence step by step. Model Architecture. The Transformer follows the familiar encoder-decoder shape. Attention maps a query and key-value pairs to an output. Multi-head attention repeats this operation in learned subspaces. Why Self-Attention. Self-attention reduces sequential operations and path length. Training. The authors train with Adam, scheduled learning rates, residual dropout, and label smoothing. Conclusion. Attention alone is a practical foundation for sequence modeling.`,
  importedAt: '2026-09-06T00:00:00.000Z',
}
