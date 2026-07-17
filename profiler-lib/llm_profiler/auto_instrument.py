import functools
import logging
from typing import List, Dict, Any, Tuple

logger = logging.getLogger(__name__)

# List of active Tracer instances (stack-based: most-recently-created active tracer is at the end)
_active_tracers = []

# List of currently active patches: (class_object, method_name, original_descriptor, was_in_dict)
_patched_methods: List[Tuple[Any, str, Any, bool]] = []

def get_active_tracer() -> Any:
    """
    Returns the most-recently-created active tracer.
    Note: Single-threaded usage assumed.
    """
    if _active_tracers:
        return _active_tracers[-1]
    return None

def register_tracer(tracer: Any) -> None:
    """
    Registers a tracer for auto-instrumentation and applies patches if not already done.
    """
    if tracer not in _active_tracers:
        _active_tracers.append(tracer)
    patch_all()

def unregister_tracer(tracer: Any) -> None:
    """
    Unregisters a tracer from auto-instrumentation.
    If no active tracers remain, restores original methods.
    """
    if tracer in _active_tracers:
        _active_tracers.remove(tracer)
    if not _active_tracers:
        unpatch_all()

def patch_method(cls: Any, name: str, stage_name: str) -> None:
    """
    Patches a class or instance method on `cls`.
    Preserves classmethod/method structure. Bypasses if already patched.
    """
    # Avoid duplicate patching on the exact same class and name
    for patched_cls, patched_name, _, _ in _patched_methods:
        if patched_cls is cls and patched_name == name:
            return

    # Find the descriptor in MRO to see if it is defined on the class or inherited
    descriptor = None
    for base in cls.__mro__:
        if name in base.__dict__:
            descriptor = base.__dict__[name]
            break

    if descriptor is None:
        descriptor = getattr(cls, name, None)

    if descriptor is None:
        return

    is_class_method = isinstance(descriptor, classmethod)
    if is_class_method:
        original_func = descriptor.__func__
    else:
        original_func = descriptor

    if not callable(original_func):
        return

    was_in_dict = name in cls.__dict__

    @functools.wraps(original_func)
    def wrapper(*args, **kwargs):
        tracer = get_active_tracer()
        # Only record if:
        # 1. This tracer is the active tracer.
        # 2. There are no active stage contexts already (re-entrancy / nesting protection).
        if tracer and not tracer._active_stage_contexts:
            with tracer.stage(stage_name):
                result = original_func(*args, **kwargs)
                _patch_model_instance_class_if_needed(result)
                return result
        else:
            result = original_func(*args, **kwargs)
            if tracer:
                _patch_model_instance_class_if_needed(result)
            return result

    if is_class_method:
        new_method = classmethod(wrapper)
    else:
        new_method = wrapper

    _patched_methods.append((cls, name, descriptor, was_in_dict))
    setattr(cls, name, new_method)

def _patch_model_instance_class_if_needed(model: Any) -> None:
    """
    On-the-fly patching for subclass models that override generate.
    If the returned object is a PreTrainedModel, we check if its class overrides `generate`.
    If so, we patch the class's `generate` method dynamically.
    """
    try:
        from transformers import PreTrainedModel, GenerationMixin
    except ImportError:
        return

    if not isinstance(model, PreTrainedModel):
        return

    model_class = model.__class__

    # Check if we already patched this concrete model class's generate method
    for patched_cls, patched_name, _, _ in _patched_methods:
        if patched_cls is model_class and patched_name == "generate":
            return

    # Check if model_class overrides generate (i.e., its generate is not GenerationMixin.generate)
    gen_mixin_generate = getattr(GenerationMixin, "generate", None)
    class_generate = getattr(model_class, "generate", None)

    if class_generate and class_generate is not gen_mixin_generate:
        patch_method(model_class, "generate", "generate")

def patch_all() -> None:
    """
    Applies auto-instrumentation patches to HuggingFace Transformers entry points.
    Gracefully handles missing transformers module.
    """
    try:
        import transformers
    except ImportError:
        # Silently do nothing if transformers is not installed
        return

    # 1. model_load targets
    if hasattr(transformers, "PreTrainedModel"):
        patch_method(transformers.PreTrainedModel, "from_pretrained", "model_load")
    if hasattr(transformers, "AutoModelForCausalLM"):
        patch_method(transformers.AutoModelForCausalLM, "from_pretrained", "model_load")

    # 2. tokenize targets
    if hasattr(transformers, "PreTrainedTokenizerBase"):
        patch_method(transformers.PreTrainedTokenizerBase, "__call__", "tokenize")

    # 3. generate targets
    if hasattr(transformers, "GenerationMixin"):
        patch_method(transformers.GenerationMixin, "generate", "generate")

    # 4. postprocess targets
    if hasattr(transformers, "PreTrainedTokenizerBase"):
        patch_method(transformers.PreTrainedTokenizerBase, "decode", "postprocess")
        patch_method(transformers.PreTrainedTokenizerBase, "batch_decode", "postprocess")

def unpatch_all() -> None:
    """
    Restores all patched methods to their original unpatched descriptors.
    Reversed order to maintain correct dependency restoration.
    """
    global _patched_methods
    for cls, name, original_descriptor, was_in_dict in reversed(_patched_methods):
        if was_in_dict:
            setattr(cls, name, original_descriptor)
        else:
            if hasattr(cls, name):
                try:
                    delattr(cls, name)
                except AttributeError:
                    pass
    _patched_methods.clear()
