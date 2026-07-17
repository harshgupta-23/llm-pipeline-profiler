import sys
import unittest
from unittest.mock import MagicMock

# 1. We mock the `transformers` module before importing llm_profiler's auto_instrument.
# This allows us to run these tests even if transformers is not installed in the test environment.
class DummyPreTrainedModel:
    @classmethod
    def from_pretrained(cls, *args, **kwargs):
        # Returns an instance of the class
        return cls()

class DummyAutoModelForCausalLM:
    @classmethod
    def from_pretrained(cls, *args, **kwargs):
        # Delegate to DummyModelSubclass
        return DummyModelSubclass.from_pretrained(*args, **kwargs)

class DummyPreTrainedTokenizerBase:
    def __call__(self, *args, **kwargs):
        return {"input_ids": [1, 2, 3]}
    
    def decode(self, *args, **kwargs):
        return "decoded text"
        
    def batch_decode(self, *args, **kwargs):
        return ["decoded text"]

class DummyGenerationMixin:
    def generate(self, *args, **kwargs):
        return [1, 2, 3]

# Subclass that does NOT override generate
class DummyModelSubclass(DummyPreTrainedModel, DummyGenerationMixin):
    pass

# Subclass that DOES override generate
class DummyModelSubclassOverridden(DummyPreTrainedModel, DummyGenerationMixin):
    def generate(self, *args, **kwargs):
        return [4, 5, 6]

# Create a mock transformers module
import types
mock_transformers = types.ModuleType("transformers")
mock_transformers.PreTrainedModel = DummyPreTrainedModel
mock_transformers.AutoModelForCausalLM = DummyAutoModelForCausalLM
mock_transformers.PreTrainedTokenizerBase = DummyPreTrainedTokenizerBase
mock_transformers.GenerationMixin = DummyGenerationMixin

# Save real transformers if it exists
real_transformers = sys.modules.get("transformers", None)

class TestAutoInstrument(unittest.TestCase):
    def setUp(self):
        # Inject mock transformers
        sys.modules["transformers"] = mock_transformers
        # Clear global state in auto_instrument
        import llm_profiler.auto_instrument as auto_instr
        auto_instr._active_tracers.clear()
        auto_instr.unpatch_all()

    def tearDown(self):
        # Restore real/no transformers
        import llm_profiler.auto_instrument as auto_instr
        auto_instr.unpatch_all()
        if real_transformers is None:
            sys.modules.pop("transformers", None)
        else:
            sys.modules["transformers"] = real_transformers

    def test_graceful_missing_transformers(self):
        # Remove transformers from sys.modules
        sys.modules.pop("transformers", None)
        
        from llm_profiler.auto_instrument import patch_all, unpatch_all, _patched_methods
        # Should not raise exception
        try:
            patch_all()
            self.assertEqual(len(_patched_methods), 0)
            unpatch_all()
        except Exception as e:
            self.fail(f"patch_all crashed with missing transformers: {e}")

    def test_basic_patch_and_unpatch(self):
        from llm_profiler import Tracer
        from llm_profiler.auto_instrument import _patched_methods
        
        # Before Tracer
        self.assertEqual(len(_patched_methods), 0)
        self.assertFalse(hasattr(DummyPreTrainedModel.from_pretrained, "__wrapped__"))
        
        # Init Tracer
        tracer = Tracer("test-run", auto_instrument=True)
        
        # Check that methods are patched
        self.assertTrue(len(_patched_methods) > 0)
        self.assertTrue(hasattr(DummyPreTrainedModel.from_pretrained, "__wrapped__"))
        self.assertTrue(hasattr(DummyPreTrainedTokenizerBase.__call__, "__wrapped__"))
        self.assertTrue(hasattr(DummyGenerationMixin.generate, "__wrapped__"))
        self.assertTrue(hasattr(DummyPreTrainedTokenizerBase.decode, "__wrapped__"))
        self.assertTrue(hasattr(DummyPreTrainedTokenizerBase.batch_decode, "__wrapped__"))

        # Test call records stages
        self.assertEqual(len(tracer.stages), 0)
        
        # Run tokenize
        tokenizer = DummyPreTrainedTokenizerBase()
        tokenizer()
        
        self.assertEqual(len(tracer.stages), 1)
        self.assertEqual(tracer.stages[0].name, "tokenize")
        
        # Stop auto instrument and check unpatched
        tracer.stop_auto_instrument()
        self.assertEqual(len(_patched_methods), 0)
        self.assertFalse(hasattr(DummyPreTrainedModel.from_pretrained, "__wrapped__"))

    def test_reentrancy_and_nesting(self):
        from llm_profiler import Tracer
        tracer = Tracer("test-run-reentrancy", auto_instrument=True)
        
        # Run inside a manual stage context
        with tracer.stage("manual_stage"):
            # Inside a stage, auto-instrumented tokenize should be bypassed (not start nested stage)
            tokenizer = DummyPreTrainedTokenizerBase()
            tokenizer()
            
        # The only stage recorded should be the manual_stage
        self.assertEqual(len(tracer.stages), 1)
        self.assertEqual(tracer.stages[0].name, "manual_stage")
        
        tracer.stop_auto_instrument()

    def test_onthefly_overridden_generate(self):
        from llm_profiler import Tracer
        tracer = Tracer("test-run-overridden", auto_instrument=True)
        
        # Check that DummyModelSubclassOverridden's generate is NOT patched yet
        self.assertFalse(hasattr(DummyModelSubclassOverridden.generate, "__wrapped__"))
        
        # Calling from_pretrained on DummyModelSubclassOverridden class should trigger the patched from_pretrained
        # which will return an instance of DummyModelSubclassOverridden and trigger dynamic subclass patching.
        model = DummyModelSubclassOverridden.from_pretrained()
        
        # The model's subclass generate should be patched on-the-fly!
        self.assertTrue(hasattr(model.generate, "__wrapped__"))
        
        # Running generate should record the generate stage
        model.generate()
        
        # Check that two stages were recorded: "model_load" and "generate"
        self.assertEqual(len(tracer.stages), 2)
        self.assertEqual(tracer.stages[0].name, "model_load")
        self.assertEqual(tracer.stages[1].name, "generate")
        
        tracer.stop_auto_instrument()

    def test_multiple_tracers_stack(self):
        from llm_profiler import Tracer
        
        tracer1 = Tracer("test-t1", auto_instrument=True)
        tracer2 = Tracer("test-t2", auto_instrument=True)
        
        # Both are active, but tracer2 is most-recently-created
        tokenizer = DummyPreTrainedTokenizerBase()
        tokenizer()
        
        # tracer2 should have 1 stage, tracer1 should have 0
        self.assertEqual(len(tracer2.stages), 1)
        self.assertEqual(len(tracer1.stages), 0)
        self.assertEqual(tracer2.stages[0].name, "tokenize")
        
        # Now stop tracer2
        tracer2.stop_auto_instrument()
        
        # Call tokenize again
        tokenizer()
        
        # tracer1 should now have 1 stage, tracer2 still has 1
        self.assertEqual(len(tracer1.stages), 1)
        self.assertEqual(len(tracer2.stages), 1)
        self.assertEqual(tracer1.stages[0].name, "tokenize")
        
        tracer1.stop_auto_instrument()

if __name__ == "__main__":
    unittest.main()
